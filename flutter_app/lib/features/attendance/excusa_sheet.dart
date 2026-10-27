import 'package:flutter/material.dart';

import '../../core/data/academic_repository.dart';
import '../../core/network/api_error.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/compact.dart';
import '../../core/widgets/ui_kit.dart';

/// Motivos de una excusa, en el orden del selector. Las claves son las del
/// servidor (`domains/attendance/excusa.ts`).
const motivosExcusa = <String, String>{
  'MEDICA': 'Incapacidad médica',
  'CALAMIDAD': 'Calamidad doméstica',
  'INSTITUCIONAL': 'Actividad institucional',
  'LABORAL': 'Motivo laboral',
  'OTRA': 'Otra',
};

/// Nombre legible del motivo de una excusa, o `null` si el registro no tiene.
String? etiquetaDeExcusa(Map<String, dynamic> registro) {
  final excusa = registro['excusa'];
  if (excusa is! Map) return null;
  return motivosExcusa[excusa['motivo']?.toString()] ?? 'Justificada';
}

/// Hoja para justificar una falta ya guardada, o retirar su excusa.
///
/// Registrarla ya es aceptarla: la pone quien recibe el soporte. Qué cuenta
/// una falta justificada lo decide el servidor (sale del porcentaje, del
/// riesgo y de los patrones). Devuelve `true` si cambió algo.
Future<bool?> mostrarHojaExcusa(
  BuildContext context, {
  required AcademicRepository repo,
  required Map<String, dynamic> registro,
  required String nombre,
}) {
  final fecha = registro['date']?.toString().split('T').first ?? '';
  return showCompactSheet<bool>(
    context: context,
    titulo: 'Excusa · $nombre',
    subtitulo: 'Falta del $fecha. Justificada, no cuenta en la asistencia.',
    constructor: (_) => _FormularioExcusa(repo: repo, registro: registro),
  );
}

class _FormularioExcusa extends StatefulWidget {
  final AcademicRepository repo;
  final Map<String, dynamic> registro;

  const _FormularioExcusa({required this.repo, required this.registro});

  @override
  State<_FormularioExcusa> createState() => _FormularioExcusaState();
}

class _FormularioExcusaState extends State<_FormularioExcusa> {
  late final Map<String, dynamic>? _actual = widget.registro['excusa'] is Map
      ? Map<String, dynamic>.from(widget.registro['excusa'] as Map)
      : null;
  late String _motivo = _actual?['motivo']?.toString() ?? 'MEDICA';
  late final _detalle = TextEditingController(
    text: _actual?['detalle']?.toString() ?? '',
  );
  bool _enviando = false;

  @override
  void dispose() {
    _detalle.dispose();
    super.dispose();
  }

  String get _id => widget.registro['_id'].toString();

  Future<void> _guardar({required bool quitar}) async {
    setState(() => _enviando = true);
    try {
      if (quitar) {
        await widget.repo.quitarExcusa(_id);
      } else {
        await widget.repo.justificarFalta(
          _id,
          motivo: _motivo,
          detalle: _detalle.text.trim(),
        );
      }
      if (!mounted) return;
      AppToast.success(
        context,
        quitar ? 'Excusa retirada' : 'Falta justificada',
      );
      Navigator.of(context).pop(true);
    } on Exception catch (error) {
      if (!mounted) return;
      setState(() => _enviando = false);
      AppToast.error(
        context,
        'No se pudo guardar la excusa',
        ApiError.from(error).message,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final palette = AppPalette.of(context);
    return ValueListenableBuilder<TextEditingValue>(
      valueListenable: _detalle,
      builder: (context, valor, _) {
        // «Otra» sin explicar no le dice nada a quien lea el acta después.
        final faltaDescribir =
            _motivo == 'OTRA' && valor.text.trim().length < 5;
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Motivo',
              style: AppType.caption.copyWith(color: palette.muted),
            ),
            const SizedBox(height: AppSpacing.gapSm),
            Wrap(
              spacing: AppSpacing.gapSm,
              runSpacing: AppSpacing.gapSm,
              children: [
                for (final entrada in motivosExcusa.entries)
                  FilterChipCompact(
                    etiqueta: entrada.value,
                    activo: _motivo == entrada.key,
                    onTap: () => setState(() => _motivo = entrada.key),
                  ),
              ],
            ),
            const SizedBox(height: AppSpacing.gap),
            TextField(
              controller: _detalle,
              maxLength: 500,
              minLines: 2,
              maxLines: 4,
              decoration: const InputDecoration(
                labelText: 'Detalle',
                hintText: 'Incapacidad de 2 días expedida por la EPS.',
              ),
            ),
            const SizedBox(height: AppSpacing.gapSm),
            FilledButton(
              onPressed: _enviando || faltaDescribir
                  ? null
                  : () => _guardar(quitar: false),
              child: Text(
                _actual == null ? 'Justificar falta' : 'Guardar excusa',
              ),
            ),
            if (_actual != null)
              TextButton(
                onPressed: _enviando ? null : () => _guardar(quitar: true),
                child: const Text('Quitar excusa'),
              ),
          ],
        );
      },
    );
  }
}
