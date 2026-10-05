import 'dart:convert';
import 'dart:io';

import 'package:path_provider/path_provider.dart';

import './outbox_entry.dart';

/// Dónde se guarda la bandeja de salida.
///
/// Es una interfaz para poder probar el servicio con una bandeja en memoria.
abstract class OutboxStorage {
  Future<List<OutboxEntry>> cargar();
  Future<void> guardar(List<OutboxEntry> entradas);
}

/// Bandeja en un archivo JSON de la carpeta de documentos de la aplicación.
///
/// **No** vive en `SharedPreferences` bajo el prefijo `cache.` porque esa
/// caché se borra al cerrar sesión y caduca a los siete días: un cambio del
/// docente sin enviar no es una copia de lo que dice el servidor, es la única
/// copia de algo que el docente hizo. Por eso tampoco caduca nunca.
///
/// Se escribe a un archivo temporal y se renombra sobre el definitivo: un cierre
/// brusco a mitad de escritura deja el archivo anterior intacto, no uno cortado.
class ArchivoOutboxStorage implements OutboxStorage {
  final Future<Directory> Function() _carpeta;

  ArchivoOutboxStorage({Future<Directory> Function()? carpeta})
    : _carpeta = carpeta ?? getApplicationDocumentsDirectory;

  static const _nombre = 'outbox.json';
  static const _version = 1;

  Future<File> _archivo(String nombre) async {
    final carpeta = await _carpeta();
    return File('${carpeta.path}${Platform.pathSeparator}$nombre');
  }

  @override
  Future<List<OutboxEntry>> cargar() async {
    final archivo = await _archivo(_nombre);
    if (!await archivo.exists()) return [];
    final crudo = await archivo.readAsString();
    try {
      final json = jsonDecode(crudo);
      final lista = json is Map ? json['entradas'] : null;
      if (lista is! List) throw const FormatException('sin entradas');
      return [
        for (final item in lista)
          if (OutboxEntry.tryFromJson(item) case final entrada?) entrada,
      ];
    } on FormatException {
      // Un archivo ilegible no se pierde en silencio ni bloquea la app: se
      // aparta para poder recuperarlo a mano y se empieza vacío.
      final aparte = await _archivo('outbox.corrupto.json');
      await archivo.copy(aparte.path);
      return [];
    }
  }

  @override
  Future<void> guardar(List<OutboxEntry> entradas) async {
    final destino = await _archivo(_nombre);
    final temporal = await _archivo('$_nombre.tmp');
    final cuerpo = jsonEncode({
      'version': _version,
      'entradas': [for (final e in entradas) e.toJson()],
    });
    await temporal.writeAsString(cuerpo, flush: true);
    await temporal.rename(destino.path);
  }
}

/// Bandeja en memoria, para pruebas.
class MemoriaOutboxStorage implements OutboxStorage {
  List<OutboxEntry> contenido;
  MemoriaOutboxStorage([List<OutboxEntry>? inicial])
    : contenido = inicial ?? [];

  @override
  Future<List<OutboxEntry>> cargar() async => List.of(contenido);

  @override
  Future<void> guardar(List<OutboxEntry> entradas) async {
    contenido = List.of(entradas);
  }
}
