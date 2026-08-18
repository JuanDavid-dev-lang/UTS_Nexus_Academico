import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/data/models.dart';
import '../../core/data/providers.dart';
import '../../core/network/api_error.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/ui_kit.dart';

/// Desglose de un estudiante: de qué notas sale cada promedio.
///
/// El consolidado responde «cuánto sacó»; esto responde «por qué». Un
/// componente reducido a un número y un contador —«Trabajos 4.2, 3 notas»— no
/// deja ver cuál está mal digitada, y esa es justo la que hay que corregir.
///
/// La cuenta se muestra explícita (4.0 + 3.5 + 5.0 ÷ 3) porque es la forma más
/// rápida de notar que falta una nota o que sobra la que se cargó dos veces.
const _componentLabels = <String, String>{
  'TRABAJOS': 'Trabajos',
  'PARCIALES': 'Parciales',
  'AUTOEVALUACION': 'Autoevaluación',
};

Future<void> showGradeBreakdown(
  BuildContext context,
  ConsolidatedRow row,
  VoidCallback onChanged,
) {
  return showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    isScrollControlled: true,
    constraints: BoxConstraints(
      maxHeight: MediaQuery.sizeOf(context).height * 0.9,
    ),
    builder: (_) => _GradeBreakdownSheet(row: row, onChanged: onChanged),
  );
}

class _GradeBreakdownSheet extends ConsumerStatefulWidget {
  final ConsolidatedRow row;
  final VoidCallback onChanged;

  const _GradeBreakdownSheet({required this.row, required this.onChanged});

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
      if (mounted) Navigator.of(context).pop();
    } catch (error) {
      if (!mounted) return;
      setState(() => _borrando = null);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(ApiError.from(error).message)),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final muted = isDark ? AppColors.textMutedDark : AppColors.textMuted;
    final danger = isDark ? AppColors.dangerDark : AppColors.danger;
    final row = widget.row;
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

            if (!tieneNotas)
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

  const _ComponentBlock({
    required this.component,
    required this.muted,
    required this.danger,
    required this.borrando,
    required this.onDelete,
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
        ],
      ),
    );
  }
}
