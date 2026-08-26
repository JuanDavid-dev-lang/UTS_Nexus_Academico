import 'dart:io';

import 'package:dio/dio.dart';
import 'package:open_filex/open_filex.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:path_provider/path_provider.dart';

/// Repositorio público que publica los instaladores como assets de un Release.
///
/// No es el del código, que es privado. Un updater tiene que poder leer el
/// listado sin credenciales, y meter un token dentro del APK no lo esconde: se
/// saca descompilándolo en un minuto. El código queda privado y los
/// instaladores públicos, que es para lo que existe un instalador.
const _releasesApi =
    'https://api.github.com/repos/JuanDavid-dev-lang/UTS_Nexus_Releases/releases/latest';

/// Una versión disponible y el archivo que hay que descargar para instalarla.
class AppRelease {
  final String version;
  final String currentVersion;
  final String notes;
  final String downloadUrl;
  final int sizeBytes;

  const AppRelease({
    required this.version,
    required this.currentVersion,
    required this.notes,
    required this.downloadUrl,
    required this.sizeBytes,
  });
}

/// Resultado de comparar dos versiones semánticas: <0, 0 o >0.
///
/// Se compara número a número y no como texto: `"0.10.0"` es mayor que
/// `"0.9.0"`, pero alfabéticamente sería al revés y la app se quedaría sin
/// actualizar justo al pasar de la novena versión menor.
int compareVersions(String a, String b) {
  List<int> parts(String value) => value
      .replaceAll(RegExp(r'^v'), '')
      .split('+')
      .first
      .split('.')
      .map((piece) => int.tryParse(piece.trim()) ?? 0)
      .toList();

  final left = parts(a);
  final right = parts(b);
  final length = left.length > right.length ? left.length : right.length;

  for (var i = 0; i < length; i++) {
    final l = i < left.length ? left[i] : 0;
    final r = i < right.length ? right[i] : 0;
    if (l != r) return l.compareTo(r);
  }
  return 0;
}

/// Traduce el fallo de red a algo que sirva para actuar.
///
/// «No se pudo consultar» a secas deja igual a quien está sin cobertura que a
/// quien tiene una versión que mira donde ya nadie publica: el primero espera y
/// se le arregla solo, el segundo puede seguir pulsando el botón para siempre.
String _porQueFallo(DioException error) {
  final codigo = error.response?.statusCode;
  if (codigo == 404) {
    return 'Esta versión busca las actualizaciones donde ya no se publican. '
        'Descarga la última desde la página de descargas.';
  }
  if (codigo == 403) {
    return 'GitHub está limitando las consultas desde esta red. '
        'Vuelve a intentarlo en un rato.';
  }
  if (codigo != null) {
    return 'El servidor de actualizaciones respondió $codigo.';
  }
  return 'Sin conexión con el servidor de actualizaciones.';
}

/// Búsqueda e instalación de actualizaciones desde GitHub Releases.
///
/// Solo tiene sentido en Android: en iOS y en escritorio el instalador lo
/// gestiona la tienda o el propio shell, y aquí se responde "no hay nada" en vez
/// de ofrecer una descarga que el sistema rechazaría.
class UpdateService {
  final Dio _dio;

  UpdateService({Dio? dio})
      : _dio = dio ??
            Dio(BaseOptions(
              connectTimeout: const Duration(seconds: 10),
              receiveTimeout: const Duration(seconds: 30),
              headers: {'Accept': 'application/vnd.github+json'},
            ));

  bool get isSupported => Platform.isAndroid;

  Future<String> currentVersion() async {
    final info = await PackageInfo.fromPlatform();
    return info.version;
  }

  /// Devuelve la versión disponible, o `null` si ya está instalada la última.
  ///
  /// Un fallo de red se propaga como [ApiUpdateException] para que la pantalla
  /// distinga "estás al día" de "no pudimos comprobarlo": mostrar lo segundo
  /// como lo primero deja a un usuario desactualizado creyendo que no lo está.
  Future<AppRelease?> check() async {
    if (!isSupported) return null;

    final installed = await currentVersion();

    final Response<dynamic> response;
    try {
      response = await _dio.get<dynamic>(_releasesApi);
    } on DioException catch (error) {
      throw ApiUpdateException(_porQueFallo(error), cause: error);
    }

    final data = response.data;
    if (data is! Map) return null;

    final tag = (data['tag_name'] ?? '').toString();
    if (tag.isEmpty) return null;
    final latest = tag.replaceFirst(RegExp(r'^v'), '');
    // Se ofrece lo que esté publicado, aunque su número sea menor: `<= 0`
    // dejaba sin salida a toda instalación existente en cuanto el producto
    // renumeraba —al pasar de 2.14.0 a Pre-release 0.1.0 no había ninguna
    // actualización que aceptar—, y de ahí solo se salía reinstalando a mano.
    // Lo que decide qué se instala es lo que publica quien publica.
    if (compareVersions(latest, installed) == 0) return null;

    final assets = (data['assets'] as List?) ?? const [];
    final apk = assets.cast<Map?>().firstWhere(
          (asset) => (asset?['name'] ?? '').toString().toLowerCase().endsWith('.apk'),
          orElse: () => null,
        );
    if (apk == null) return null;

    return AppRelease(
      version: latest,
      currentVersion: installed,
      notes: (data['body'] ?? '').toString(),
      downloadUrl: (apk['browser_download_url'] ?? '').toString(),
      sizeBytes: (apk['size'] as num?)?.toInt() ?? 0,
    );
  }

  /// Descarga el APK y se lo entrega al instalador del sistema.
  ///
  /// El sistema pedirá permiso para instalar desde esta app la primera vez; sin
  /// esa autorización del usuario la instalación no ocurre, y eso es deliberado.
  Future<void> download(
    AppRelease release, {
    void Function(int received, int total)? onProgress,
  }) async {
    final directory = await getTemporaryDirectory();
    final file = File('${directory.path}/uts-nexus-${release.version}.apk');
    if (await file.exists()) await file.delete();

    try {
      await _dio.download(
        release.downloadUrl,
        file.path,
        onReceiveProgress: onProgress,
      );
    } on DioException catch (error) {
      throw ApiUpdateException('La descarga se interrumpió.', cause: error);
    }

    final result = await OpenFilex.open(file.path);
    if (result.type != ResultType.done) {
      throw ApiUpdateException(
        'No se pudo abrir el instalador: ${result.message}',
      );
    }
  }
}

/// Fallo al buscar o descargar una actualización.
class ApiUpdateException implements Exception {
  final String message;
  final Object? cause;

  const ApiUpdateException(this.message, {this.cause});

  @override
  String toString() => message;
}
