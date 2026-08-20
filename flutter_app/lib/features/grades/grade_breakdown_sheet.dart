import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/data/models.dart';
import '../../core/data/providers.dart';
import '../../core/network/api_error.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/ui_kit.dart';

/// Desglose de un estudiante — y el sitio donde se registran sus notas.
///
/// El consolidado responde «cuánto sacó»; esto responde «por qué» y permite
/// actuar: cada componente muestra sus subnotas con nombre, la cuenta
/// explícita (3.5 + 2.5 ÷ 2 = 3.0) y, con [CapturaNotas], un renglón para
/// añadir la siguiente ahí mismo. El promedio y las notas de corte y final
/// los calcula el backend; aquí solo se pintan y se envían notas nuevas.
const _componentLabels = <String, String>{
  'TRABAJOS': 'Trabajos',
  'PARCIALES': 'Parciales',
  'AUTOEVALUACION': 'Autoevaluación',
};

/// Contexto para poder registrar desde el desglose. Sin él, solo lectura.
class CapturaNotas {
  final String subjectId;
  final String teacherId;
  final String period;
  const CapturaNotas({
    required this.subjectId,
    required this.teacherId,
    required this.period,
  });
}

/// Fila vacía para un estudiante que aún no tiene ninguna nota: la estructura
/// de la rúbrica con todo en cero, para que el registro pueda empezar por
/// cualquier componente. Los pesos aquí solo ROTULAN; en cuanto existe una
/// nota, todos los números vienen del backend.
ConsolidatedRow filaVaciaDeEstudiante({
  required String studentId,
  required String code,
  required String fullName,
}) {
  return ConsolidatedRow(
    studentId: studentId,
    code: code,
    fullName: fullName,
    finalGrade: 0,
    passed: false,
    complete: false,
    cuts: [
      for (final corte in [1, 2, 3])
        CutSummary(
          cut: corte,
          weight: corte == 3 ? 0.34 : 0.33,
          grade: 0,
          complete: false,
          components: const [
            ComponentSummary(
                type: 'TRABAJOS', weight: 0.3, average: 0, count: 0, notes: []),
            ComponentSummary(
                type: 'PARCIALES', weight: 0.6, average: 0, count: 0, notes: []),
            ComponentSummary(
                type: 'AUTOEVALUACION',
                weight: 0.1,
                average: 0,
                count: 0,
                notes: []),
          ],
        ),
    ],
  );
}

Future<void> showGradeBreakdown(
  BuildContext context,
  ConsolidatedRow row,
  VoidCallback onChanged, {
  /// El filtro de materia con el que la página pidió el consolidado: es la
  /// clave del provider que este sheet observa para que la fila se refresque
  /// sola tras añadir o borrar una nota.
  String? subjectIdFiltro,
  CapturaNotas? captura,
}) {
  return showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    isScrollControlled: true,
    constraints: BoxConstraints(
      maxHeight: MediaQuery.sizeOf(context).height * 0.9,
    ),
    builder: (_) => _GradeBreakdownSheet(
      row: row,
      onChanged: onChanged,
      subjectIdFiltro: subjectIdFiltro,
      captura: captura,
    ),
  );
}

class _GradeBreakdownSheet extends ConsumerStatefulWidget {
  final ConsolidatedRow row;
  final VoidCallback onChanged;
  final String? subjectIdFiltro;
  final CapturaNotas? captura;

  const _GradeBreakdownSheet({
    required this.row,
    required this.onChanged,
    this.subjectIdFiltro,
    this.captura,
  });

  @override
  ConsumerState<_GradeBreakdownSheet> createState() =>
      _GradeBreakdownSheetState();
}

class _GradeBreakdownSheetState extends ConsumerState<_GradeBreakdownSheet> {
  String? _borrando;

  Future<void> _eliminar(GradeDetail nota) async {
    final confirmado = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('¿Eliminar esta nota?'),
        content: Text(
          'Se elimina «${nota.label}» (${nota.score.toStringAsFixed(1)}). '
          'El promedio del componente se recalcula sin ella, y con él la nota '
          'del corte y la final.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: AppColors.danger),
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('Eliminar'),
          ),
        ],
      ),
    );
    if (confirmado != true || !mounted) return;

    setState(() => _borrando = nota.id);
    try {
      await ref.read(academicRepositoryProvider).deleteGrade(nota.id);
      widget.onChanged();
      // La hoja se queda abierta: observa el consolidado y la fila se
      // refresca sola, que es donde se ve el promedio recalculado.
      if (mounted) setState(() => _borrando = null);
    } catch (error) {
      if (!mounted) return;
      setState(() => _borrando = null);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(ApiError.from(error).message)),
      );
    }
  }

  Future<void> _agregar(
      int corte, String tipo, String label, double score) async {
    final captura = widget.captura!;
    await ref.read(academicRepositoryProvider).saveGrade(
          studentId: widget.row.studentId,
          subjectId: captura.subjectId,
          teacherId: captura.teacherId,
          cut: corte,
          componentType: tipo,
          label: label,
          score: score,
          period: captura.period,
        );
    widget.onChanged();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final muted = isDark ? AppColors.textMutedDark : AppColors.textMuted;
    final danger = isDark ? AppColors.dangerDark : AppColors.danger;

    // La fila VIVA: la que llegó al abrir es una foto, y aquí también se
    // registran notas — con la foto, lo añadido no se vería hasta cerrar y
    // volver a abrir. Si el estudiante aún no aparece en el consolidado
    // (sin notas), se usa la estructura con la que se abrió.
    final consolidado =
        ref.watch(consolidatedProvider(widget.subjectIdFiltro)).valueOrNull;
    var row = widget.row;
    if (consolidado != null) {
      row = consolidado.firstWhere(
        (item) => item.studentId == widget.row.studentId,
        orElse: () => widget.row,
      );
    }
    final tieneNotas = row.cuts
        .any((cut) => cut.components.any((component) => component.count > 0));

    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(row.fullName, style: AppType.h3),
            Text(
              '${row.code} · nota final ${row.finalGrade.toStringAsFixed(2)}',
              style: AppType.caption.copyWith(color: muted),
            ),
            const SizedBox(height: 16),

            if (!tieneNotas && widget.captura == null)
              StateView.empty(
                'Todavía sin notas.\n'
                'Cuando registres la primera, aquí verás de qué se compone '
                'cada corte.',
              )
            else
              for (final cut in row.cuts) ...[
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        'Corte ${cut.cut}  ·  ${(cut.weight * 100).round()}% de la final',
                        style: AppType.bodyStrong,
                      ),
                    ),
                    Text(cut.grade.toStringAsFixed(2),
                        style: AppType.bodyStrong),
                  ],
                ),
                const SizedBox(height: 8),
                for (final component in cut.components)
                  _ComponentBlock(
                    component: component,
                    muted: muted,
                    danger: danger,
                    borrando: _borrando,
                    onDelete: _eliminar,
                    onAgregar: widget.captura == null
                        ? null
                        : (label, score) =>
                            _agregar(cut.cut, component.type, label, score),
                  ),
                const SizedBox(height: 18),
              ],
          ],
        ),
      ),
    );
  }
}

class _ComponentBlock extends StatelessWidget {
  final ComponentSummary component;
  final Color muted;
  final Color danger;
  final String? borrando;
  final Future<void> Function(GradeDetail) onDelete;

  /// Presente = aquí se puede registrar: pinta el renglón de añadir.
  final Future<void> Function(String label, double score)? onAgregar;

  const _ComponentBlock({
    required this.component,
    required this.muted,
    required this.danger,
    required this.borrando,
    required this.onDelete,
    this.onAgregar,
  });

  @override
  Widget build(BuildContext context) {
    final nombre = _componentLabels[component.type] ?? component.type;
    final peso = '${(component.weight * 100).round()}%';

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        border: Border.all(
          color: Theme.of(context).brightness == Brightness.dark
              ? AppColors.borderDark
              : AppColors.border,
        ),
        borderRadius: BorderRadius.circular(AppSpacing.radiusInput),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text('$nombre  $peso',
                    style: AppType.captionStrong.copyWith(color: muted)),
              ),
              if (component.count == 0)
                const StatusPill('Sin calificar', kind: SemanticKind.warning)
              else
                Text(
                  component.average.toStringAsFixed(2),
                  style: AppType.bodyStrong,
                ),
            ],
          ),
          if (component.count > 1) ...[
            const SizedBox(height: 4),
            // La cuenta explícita: promedio = suma de las notas / cuántas hay.
            Text(
              '${component.notes.map((n) => n.score.toStringAsFixed(1)).join(' + ')}'
              ' ÷ ${component.count}',
              style: AppType.caption.copyWith(color: muted),
            ),
          ],
          for (final nota in component.notes)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Row(
                children: [
                  Expanded(
                    child: Text(nota.label,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: AppType.caption),
                  ),
                  Text(nota.score.toStringAsFixed(1), style: AppType.caption),
                  const SizedBox(width: 4),
                  if (borrando == nota.id)
                    const SizedBox(
                      height: 18,
                      width: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  else
                    IconButton(
                      visualDensity: VisualDensity.compact,
                      tooltip: 'Eliminar ${nota.label}',
                      icon: Icon(Icons.delete_outline, size: 18, color: danger),
                      onPressed: borrando == null ? () => onDelete(nota) : null,
                    ),
                ],
              ),
            ),
          if (onAgregar != null) _AgregarNotaFila(onAgregar: onAgregar!),
        ],
      ),
    );
  }
}

/// Renglón para añadir una nota dentro de su componente.
///
/// El corte y el componente ya los dice el sitio donde está el renglón: solo
/// se piden las dos cosas que el docente sabe y el sistema no — qué actividad
/// fue y cuánto sacó. Tras guardar se limpian los campos y la hoja se queda
/// abierta: la fila observa el consolidado y se refresca sola.
class _AgregarNotaFila extends StatefulWidget {
  final Future<void> Function(String label, double score) onAgregar;
  const _AgregarNotaFila({required this.onAgregar});

  @override
  State<_AgregarNotaFila> createState() => _AgregarNotaFilaState();
}

class _AgregarNotaFilaState extends State<_AgregarNotaFila> {
  final _actividad = TextEditingController();
  final _nota = TextEditingController();
  bool _enviando = false;

  @override
  void dispose() {
    _actividad.dispose();
    _nota.dispose();
    super.dispose();
  }

  Future<void> _guardar() async {
    final label = _actividad.text.trim();
    final score = double.tryParse(_nota.text.trim().replaceAll(',', '.'));
    final mensajero = ScaffoldMessenger.of(context);
    if (label.isEmpty) {
      mensajero.showSnackBar(
          const SnackBar(content: Text('Escribe qué actividad fue.')));
      return;
    }
    if (score == null || score < 0 || score > 5) {
      mensajero.showSnackBar(
          const SnackBar(content: Text('La nota va de 0.0 a 5.0.')));
      return;
    }

    setState(() => _enviando = true);
    try {
      await widget.onAgregar(label, score);
      if (!mounted) return;
      _actividad.clear();
      _nota.clear();
      setState(() => _enviando = false);
    } catch (error) {
      if (!mounted) return;
      setState(() => _enviando = false);
      mensajero.showSnackBar(
          SnackBar(content: Text(ApiError.from(error).message)));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: Row(
        children: [
          Expanded(
            child: TextField(
              controller: _actividad,
              decoration: const InputDecoration(
                hintText: 'Actividad (taller, quiz…)',
                isDense: true,
              ),
              style: AppType.caption,
            ),
          ),
          const SizedBox(width: 8),
          SizedBox(
            width: 64,
            child: TextField(
              controller: _nota,
              keyboardType:
                  const TextInputType.numberWithOptions(decimal: true),
              decoration: const InputDecoration(
                hintText: '0–5',
                isDense: true,
              ),
              style: AppType.caption,
              onSubmitted: (_) => _guardar(),
            ),
          ),
          const SizedBox(width: 4),
          if (_enviando)
            const SizedBox(
              height: 20,
              width: 20,
              child: CircularProgressIndicator(strokeWidth: 2),
            )
          else
            IconButton(
              visualDensity: VisualDensity.compact,
              tooltip: 'Añadir nota',
              icon: const Icon(Icons.add_circle_outline, size: 20),
              onPressed: _guardar,
            ),
        ],
      ),
    );
  }
}
