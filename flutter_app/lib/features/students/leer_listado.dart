import 'dart:convert';

import 'package:file_selector/file_selector.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../../core/data/providers.dart';
import '../../core/network/api_error.dart';
import '../../core/storage/offline_status.dart';
import '../../core/theme/app_theme.dart';
import 'roster_scan.dart';

/// Lo que se lee de un archivo: el texto para el cuadro de la lista y lo que
/// hay que decirle al docente.
typedef ListadoLeido = ({String texto, String resumen, bool hayDudosas});

/// Grupo de tipos del selector. Cada plataforma mira un campo distinto —Android
/// los `mimeTypes`, iOS los `uniformTypeIdentifiers` (sin ellos lanza), el
/// escritorio las extensiones—, así que van los tres.
XTypeGroup _tiposDeListado({required bool soloTexto}) => XTypeGroup(
  label: soloTexto ? 'Listado CSV' : 'Listado',
  extensions: soloTexto
      ? const ['csv', 'tsv', 'txt']
      : extensionesDelSelector,
  mimeTypes: [
    'text/csv',
    'text/comma-separated-values',
    'text/tab-separated-values',
    'text/plain',
    if (!soloTexto) ...[
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'application/pdf',
    ],
  ],
  uniformTypeIdentifiers: [
    'public.comma-separated-values-text',
    'public.tab-separated-values-text',
    'public.plain-text',
    if (!soloTexto) ...[
      'org.openxmlformats.spreadsheetml.sheet',
      'com.microsoft.excel.xls',
      'com.adobe.pdf',
    ],
  ],
);

/// Botones «Archivo» y «Foto» encima del cuadro de la lista pegada.
///
/// Lo leído **no se matricula**: cae en el cuadro de texto y pasa por la misma
/// revisión que una lista escrita a mano (`parseRoster`), y solo el botón de
/// confirmar llama a `POST /enrollments/bulk`. Con [groupId] null (el alta en
/// el directorio, que no cuelga de un grupo) solo se ofrece abrir un CSV, que
/// se lee en el teléfono: el escáner del servidor exige el grupo.
class LeerListado extends ConsumerStatefulWidget {
  final String? groupId;
  final bool habilitado;
  final ValueChanged<ListadoLeido> onLeido;

  const LeerListado({
    super.key,
    required this.groupId,
    required this.onLeido,
    this.habilitado = true,
  });

  @override
  ConsumerState<LeerListado> createState() => _LeerListadoState();
}

class _LeerListadoState extends ConsumerState<LeerListado> {
  bool _leyendo = false;
  String? _error;

  bool get _conEscaner => widget.groupId != null;

  Future<void> _elegirArchivo() async {
    final XFile? archivo;
    try {
      archivo = await openFile(
        acceptedTypeGroups: [_tiposDeListado(soloTexto: !_conEscaner)],
        confirmButtonText: 'Leer',
      );
    } on Exception {
      _fallar('No se pudo abrir el selector de archivos.');
      return;
    }
    if (archivo == null) return;
    await _procesar(archivo.name, archivo);
  }

  Future<void> _tomarFoto(ImageSource origen) async {
    final XFile? foto;
    try {
      foto = await ImagePicker().pickImage(
        source: origen,
        // Basta para leer una hoja impresa y deja la subida en unos cientos de
        // KB en vez de los 4–8 MB de la cámara, que por el wifi del aula es
        // la diferencia entre segundos y un minuto.
        maxWidth: 2400,
        maxHeight: 2400,
        imageQuality: 85,
      );
    } on Exception {
      _fallar(
        origen == ImageSource.camera
            ? 'No se pudo abrir la cámara. Revisa el permiso en los ajustes '
                  'del teléfono.'
            : 'No se pudo abrir la galería.',
      );
      return;
    }
    if (foto == null) return;
    // La foto ya viene recomprimida en JPEG; un nombre sin extensión conocida
    // la dejaría fuera del filtro del servidor.
    final nombre = tipoParaSubir(foto.name) == null ? 'listado.jpg' : foto.name;
    await _procesar(nombre, foto);
  }

  Future<void> _procesar(String nombre, XFile archivo) async {
    final destino = destinoDeArchivo(nombre);
    if (destino == DestinoArchivoListado.noAdmitido ||
        (destino == DestinoArchivoListado.servidor && !_conEscaner)) {
      _fallar(
        _conEscaner
            ? 'Ese tipo de archivo no se puede leer. Usa CSV, XLSX, PDF o una '
                  'foto.'
            : 'Aquí solo se lee un CSV. Para un PDF o una foto, matricula '
                  'desde la materia.',
      );
      return;
    }

    setState(() {
      _leyendo = true;
      _error = null;
    });
    try {
      final tamano = await archivo.length();
      if (tamano > tamanoMaximoListado) {
        _fallar('El archivo pesa más de 12 MB. Recórtalo o toma una foto.');
        return;
      }
      final bytes = await archivo.readAsBytes();
      final leido = destino == DestinoArchivoListado.local
          ? _leerTexto(bytes)
          : await _leerEnServidor(nombre, bytes);
      if (!mounted) return;
      widget.onLeido(leido);
    } on ApiError catch (error) {
      _fallar(
        mensajeDeFalloDeLectura(
          status: error.statusCode,
          sinRespuesta:
              error.kind == ApiErrorKind.network ||
              error.kind == ApiErrorKind.timeout,
          mensaje: error.message,
        ),
      );
    } on Exception {
      _fallar('No se pudo leer el archivo.');
    } finally {
      if (mounted) setState(() => _leyendo = false);
    }
  }

  ListadoLeido _leerTexto(List<int> bytes) {
    // `allowMalformed`: un CSV guardado por Excel en Windows-1252 trae tildes
    // que no son UTF-8 válido. Mejor una letra rara que no abrir el archivo;
    // la revisión la enseña antes de matricular.
    final texto = utf8.decode(bytes, allowMalformed: true);
    return (
      texto: texto,
      resumen: 'Archivo cargado. Revisa la lista antes de confirmar.',
      hayDudosas: false,
    );
  }

  Future<ListadoLeido> _leerEnServidor(String nombre, List<int> bytes) async {
    final cuerpo = await ref
        .read(academicRepositoryProvider)
        .scanRoster(
          groupId: widget.groupId!,
          bytes: bytes,
          nombre: nombre,
          tipo: tipoParaSubir(nombre)!,
        );
    final propuesta = PropuestaDeListado.fromJson(cuerpo);
    return (
      texto: propuesta.comoTexto(),
      resumen: propuesta.resumen(),
      hayDudosas: propuesta.dudosas.isNotEmpty || propuesta.filas.isEmpty,
    );
  }

  void _fallar(String mensaje) {
    if (!mounted) return;
    setState(() {
      _leyendo = false;
      _error = mensaje;
    });
  }

  @override
  Widget build(BuildContext context) {
    // Leer un PDF, una hoja o una foto necesita al servidor cada vez (y al
    // servicio de lectura detrás): sin conexión no hay nada guardado que
    // proponer, igual que `RequiereConexion` en las pantallas enteras. El CSV
    // se lee en el teléfono y sigue disponible. Sin escáner (el directorio)
    // no se pregunta: la hoja del directorio no depende de ningún provider.
    final sinConexion =
        _conEscaner &&
        ref.watch(offlineStatusProvider).valueOrNull?.desdeCache != null;
    final activo = widget.habilitado && !_leyendo;
    final escanerActivo = activo && _conEscaner && !sinConexion;
    final muted = context.palette.muted;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Wrap(
          spacing: AppSpacing.gapSm,
          runSpacing: AppSpacing.gapXs,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            OutlinedButton.icon(
              key: const Key('listado-archivo'),
              onPressed: activo ? _elegirArchivo : null,
              icon: const Icon(Icons.upload_file_outlined, size: 18),
              label: Text(_conEscaner ? 'Archivo' : 'Abrir CSV'),
            ),
            if (_conEscaner) ...[
              OutlinedButton.icon(
                key: const Key('listado-camara'),
                onPressed: escanerActivo
                    ? () => _tomarFoto(ImageSource.camera)
                    : null,
                icon: const Icon(Icons.photo_camera_outlined, size: 18),
                label: const Text('Foto'),
              ),
              IconButton(
                key: const Key('listado-galeria'),
                tooltip: 'Elegir foto de la galería',
                onPressed: escanerActivo
                    ? () => _tomarFoto(ImageSource.gallery)
                    : null,
                icon: const Icon(Icons.photo_library_outlined),
              ),
            ],
            if (_leyendo)
              const SizedBox(
                width: 18,
                height: 18,
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
          ],
        ),
        if (_conEscaner)
          Text(
            sinConexion
                ? 'Leer un PDF, una hoja de cálculo o una foto necesita '
                      'conexión. Sin ella puedes abrir un CSV o pegar la lista.'
                : 'CSV, XLSX o PDF, o una foto de la lista impresa. Lo leído '
                      'cae abajo para revisarlo: nada se guarda sin confirmar.',
            style: AppType.caption.copyWith(color: muted),
          ),
        if (_error != null)
          Padding(
            padding: const EdgeInsets.only(top: AppSpacing.gapXs),
            child: Text(
              _error!,
              key: const Key('listado-error'),
              style: AppType.caption.copyWith(
                color: SemanticTone.of(context, SemanticKind.danger).fg,
              ),
            ),
          ),
      ],
    );
  }
}
