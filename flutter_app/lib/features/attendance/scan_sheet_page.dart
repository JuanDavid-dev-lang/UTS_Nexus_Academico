import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../../core/data/providers.dart';
import '../../core/network/api_error.dart';
import '../../core/services/attendance_scan_service.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/ui_kit.dart';

enum _Paso { elegir, leyendo, revisar, guardando }

/// Importa asistencia fotografiando la planilla de papel.
///
/// El paso de revisión es obligatorio y no hay atajo para saltárselo. El
/// reconocimiento propone; el docente confirma. Una asistencia mal guardada no
/// se nota el día que se guarda: aparece semanas después como un porcentaje que
/// no cuadra, cuando ya nadie tiene la hoja para contrastar.
class ScanSheetPage extends ConsumerStatefulWidget {
  const ScanSheetPage({super.key});

  @override
  ConsumerState<ScanSheetPage> createState() => _ScanSheetPageState();
}

class _ScanSheetPageState extends ConsumerState<ScanSheetPage> {
  _Paso _paso = _Paso.elegir;
  String? _groupId;
  EscaneoPlanilla? _escaneo;
  List<DateTime?> _fechas = [];
  // Minutos por clase. Fijo por ahora: la planilla no dice cuánto duró cada una.
  final int _duracion = 90;
  String? _error;

  final _servicio = AttendanceScanService();

  bool get _fechasCompletas => _fechas.isNotEmpty && _fechas.every((f) => f != null);

  bool get _fechasRepetidas {
    final dias = _fechas
        .whereType<DateTime>()
        .map((f) => '${f.year}-${f.month}-${f.day}')
        .toList();
    return dias.toSet().length != dias.length;
  }

  Future<void> _tomarFoto(ImageSource origen) async {
    final grupo = _groupId;
    if (grupo == null) return;

    final foto = await ImagePicker().pickImage(
      source: origen,
      // Suficiente para leer la cuadrícula sin subir 12 MB por la red del campus.
      maxWidth: 2000,
      imageQuality: 88,
    );
    if (foto == null) return;

    setState(() {
      _paso = _Paso.leyendo;
      _error = null;
    });

    try {
      final resultado = await _servicio.escanear(groupId: grupo, rutaImagen: foto.path);
      if (!mounted) return;
      setState(() {
        _escaneo = resultado;
        // Vacías a propósito: rellenarlas con una fecha plausible convertiría la
        // confirmación en un trámite y guardar una clase en la fecha equivocada
        // es un error que nadie detecta después.
        _fechas = List<DateTime?>.filled(resultado.columnasFecha, null);
        _paso = _Paso.revisar;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _error = ApiError.from(error).message;
        _paso = _Paso.elegir;
      });
    }
  }

  Future<void> _guardar() async {
    final escaneo = _escaneo;
    if (escaneo == null) return;

    setState(() => _paso = _Paso.guardando);
    try {
      final guardados = await _servicio.confirmar(
        groupId: escaneo.groupId,
        fechas: _fechas.whereType<DateTime>().toList(),
        durationMinutes: _duracion,
        filas: escaneo.filas,
      );
      if (!mounted) return;
      AppToast.success(context, 'Asistencia importada', '$guardados registros guardados');
      Navigator.of(context).pop(true);
    } catch (error) {
      if (!mounted) return;
      setState(() => _paso = _Paso.revisar);
      AppToast.error(context, 'No se pudo guardar', ApiError.from(error).message);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Importar desde una foto')),
      body: switch (_paso) {
        _Paso.elegir => _elegir(),
        _Paso.leyendo => const Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                CircularProgressIndicator(),
                SizedBox(height: 14),
                Text('Leyendo la planilla…'),
              ],
            ),
          ),
        _ => _revisar(),
      },
    );
  }

  Widget _elegir() {
    final grupos = ref.watch(groupsProvider);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final muted = isDark ? AppColors.textMutedDark : AppColors.textMuted;

    return ListView(
      padding: AppSpacing.pagePadding,
      children: [
        AppCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('¿De qué grupo es la planilla?', style: AppType.body),
              const SizedBox(height: 12),
              grupos.when(
                loading: () => const SkeletonBox(height: 52, radius: 12),
                error: (error, _) => Text(ApiError.from(error).message, style: AppType.caption),
                data: (items) => DropdownButtonFormField<String>(
                  initialValue: _groupId,
                  isExpanded: true,
                  decoration: const InputDecoration(labelText: 'Grupo', isDense: true),
                  items: items
                      .map((g) => DropdownMenuItem(
                            value: g.id,
                            child: Text('${g.name} · ${g.period}',
                                overflow: TextOverflow.ellipsis),
                          ))
                      .toList(),
                  onChanged: (valor) => setState(() => _groupId = valor),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        FilledButton.icon(
          onPressed: _groupId == null ? null : () => _tomarFoto(ImageSource.camera),
          icon: const Icon(Icons.photo_camera_outlined),
          label: const Text('Tomar la foto'),
        ),
        const SizedBox(height: 10),
        OutlinedButton.icon(
          onPressed: _groupId == null ? null : () => _tomarFoto(ImageSource.gallery),
          icon: const Icon(Icons.image_outlined),
          label: const Text('Elegir de la galería'),
        ),
        const SizedBox(height: 18),
        Text(
          'La hoja tiene que salir completa y con la cuadrícula visible. Primera columna '
          'la cédula, segunda el nombre, y de la tercera en adelante una por clase.',
          style: AppType.caption.copyWith(color: muted),
        ),
        if (_error != null) ...[
          const SizedBox(height: 16),
          AppCard(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.error_outline,
                    size: 18, color: SemanticTone.of(context, SemanticKind.danger).fg),
                const SizedBox(width: 8),
                Expanded(child: Text(_error!, style: AppType.caption)),
              ],
            ),
          ),
        ],
      ],
    );
  }

  Widget _revisar() {
    final escaneo = _escaneo!;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final muted = isDark ? AppColors.textMutedDark : AppColors.textMuted;
    final sinAsignar = escaneo.filas.where((f) => f.studentId == null).length;

    return Column(
      children: [
        Expanded(
          child: ListView(
            padding: AppSpacing.pagePadding,
            children: [
              for (final aviso in escaneo.avisos) ...[
                AppCard(
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(Icons.warning_amber_outlined,
                          size: 18, color: SemanticTone.of(context, SemanticKind.warning).fg),
                      const SizedBox(width: 8),
                      Expanded(child: Text(aviso, style: AppType.caption)),
                    ],
                  ),
                ),
                const SizedBox(height: 10),
              ],

              StatusPill(
                '${escaneo.filas.length - sinAsignar} de ${escaneo.filas.length} identificados',
                kind: sinAsignar > 0 ? SemanticKind.warning : SemanticKind.success,
              ),
              const SizedBox(height: 16),

              Text('¿De qué fecha es cada columna?', style: AppType.body),
              const SizedBox(height: 8),
              for (var i = 0; i < _fechas.length; i++)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: OutlinedButton.icon(
                    onPressed: () async {
                      final elegida = await showDatePicker(
                        context: context,
                        initialDate: _fechas[i] ?? DateTime.now(),
                        firstDate: DateTime(DateTime.now().year - 1),
                        lastDate: DateTime.now(),
                      );
                      if (elegida != null) setState(() => _fechas[i] = elegida);
                    },
                    icon: const Icon(Icons.event_outlined, size: 18),
                    label: Text(
                      _fechas[i] == null
                          ? 'Clase ${i + 1} — elegir fecha'
                          : 'Clase ${i + 1} — ${_fechas[i]!.day}/${_fechas[i]!.month}/${_fechas[i]!.year}',
                    ),
                  ),
                ),
              if (_fechasRepetidas)
                Text(
                  'Hay fechas repetidas. Cada columna es una clase distinta; si se repiten, '
                  'una sobrescribiría a la otra.',
                  style: AppType.caption
                      .copyWith(color: SemanticTone.of(context, SemanticKind.danger).fg),
                ),

              const SizedBox(height: 18),
              Text('Revisá cada fila', style: AppType.body),
              const SizedBox(height: 8),
              for (final fila in escaneo.filas)
                _FilaRevision(
                  fila: fila,
                  matriculados: escaneo.matriculados,
                  muted: muted,
                  onCambio: () => setState(() {}),
                ),
            ],
          ),
        ),
        SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: _paso == _Paso.guardando ||
                        !_fechasCompletas ||
                        _fechasRepetidas ||
                        escaneo.filas.every((f) => f.studentId == null)
                    ? null
                    : _guardar,
                child: _paso == _Paso.guardando
                    ? const SizedBox(
                        height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2.4))
                    : const Text('Guardar asistencia'),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

/// Una fila con sus casillas editables y, si hizo falta, el selector de persona.
class _FilaRevision extends StatelessWidget {
  final FilaEscaneada fila;
  final List<Matriculado> matriculados;
  final Color muted;
  final VoidCallback onCambio;

  const _FilaRevision({
    required this.fila,
    required this.matriculados,
    required this.muted,
    required this.onCambio,
  });

  @override
  Widget build(BuildContext context) {
    final identificada = fila.studentId != null;

    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: AppCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (identificada) ...[
              Text(fila.fullName ?? '', style: AppType.body),
              Text(fila.code ?? '', style: AppType.caption.copyWith(color: muted)),
              if (fila.nivel != NivelCoincidencia.exacta) ...[
                const SizedBox(height: 6),
                StatusPill(
                  fila.nivel == NivelCoincidencia.probable
                      ? 'Cédula aproximada'
                      : 'Revisar',
                  kind: SemanticKind.warning,
                ),
              ],
            ] else ...[
              Text(
                'Se leyó «${fila.cedulaLeida.isEmpty ? fila.nombreLeido : fila.cedulaLeida}» '
                'y no coincide con nadie del grupo.',
                style: AppType.caption
                    .copyWith(color: SemanticTone.of(context, SemanticKind.danger).fg),
              ),
              const SizedBox(height: 8),
              DropdownButtonFormField<String>(
                isExpanded: true,
                decoration: const InputDecoration(
                    labelText: '¿A quién corresponde?', isDense: true),
                items: matriculados
                    .map((m) => DropdownMenuItem(
                          value: m.id,
                          child: Text('${m.fullName} · ${m.code}',
                              overflow: TextOverflow.ellipsis),
                        ))
                    .toList(),
                onChanged: (valor) {
                  fila.asignar(
                    matriculados.where((m) => m.id == valor).firstOrNull,
                  );
                  onCambio();
                },
              ),
            ],
            for (final aviso in fila.avisos)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text(aviso,
                    style: AppType.caption
                        .copyWith(color: SemanticTone.of(context, SemanticKind.warning).fg)),
              ),
            const SizedBox(height: 10),
            Wrap(
              spacing: 6,
              children: [
                for (final celda in fila.celdas)
                  FilterChip(
                    label: Text('${celda.columna + 1}'),
                    selected: celda.presente,
                    onSelected: (valor) {
                      celda.presente = valor;
                      onCambio();
                    },
                  ),
              ],
            ),
            Text(
              'Marcado = asistió',
              style: AppType.caption.copyWith(color: muted),
            ),
          ],
        ),
      ),
    );
  }
}
