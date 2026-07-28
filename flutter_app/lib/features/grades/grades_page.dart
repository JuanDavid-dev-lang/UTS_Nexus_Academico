import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/data/models.dart';
import '../../core/data/providers.dart';
import '../../core/network/api_error.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/period_selector.dart';
import '../../core/widgets/ui_kit.dart';

/// Se conserva el nombre por compatibilidad con las invalidaciones que dispara
/// la sincronización en tiempo real.
final consolidatedGradesProvider = consolidatedProvider;

/// Consolidado de notas.
///
/// El cliente NO calcula nada: la rúbrica 30/60/10 y los pesos 33/33/34 viven
/// solo en el backend. Aquí se muestra lo que el motor consolidó.
///
/// Los cortes incompletos se marcan en cursiva. Un 2.0 al que aún le faltan
/// componentes por calificar no significa lo mismo que un 2.0 definitivo, y
/// confundirlos lleva a alarmar a un estudiante que todavía va bien.
class GradesPage extends ConsumerStatefulWidget {
  const GradesPage({super.key});

  @override
  ConsumerState<GradesPage> createState() => _GradesPageState();
}

class _GradesPageState extends ConsumerState<GradesPage> {
  String? _subjectId;
  String _query = '';

  @override
  Widget build(BuildContext context) {
    final subjects = ref.watch(periodSubjectsProvider);
    final rows = ref.watch(consolidatedProvider(_subjectId));
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final muted = isDark ? AppColors.textMutedDark : AppColors.textMuted;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Consolidado'),
        actions: const [PeriodSelector()],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            child: subjects.when(
              loading: () => const SkeletonBox(height: 48, radius: 12),
              error: (_, __) => const SizedBox.shrink(),
              data: (items) => DropdownButtonFormField<String?>(
                initialValue: _subjectId,
                isExpanded: true,
                decoration: const InputDecoration(
                  labelText: 'Materia',
                  isDense: true,
                ),
                items: [
                  const DropdownMenuItem(
                      value: null, child: Text('Todas las materias')),
                  for (final subject in items)
                    DropdownMenuItem(
                      value: subject.id,
                      child: Text('${subject.name} (${subject.code})',
                          overflow: TextOverflow.ellipsis),
                    ),
                ],
                onChanged: (value) => setState(() => _subjectId = value),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: TextField(
              onChanged: (value) => setState(() => _query = value),
              decoration: const InputDecoration(
                hintText: 'Buscar estudiante…',
                prefixIcon: Icon(Icons.search),
                isDense: true,
              ),
            ),
          ),
          const SizedBox(height: 10),
          Expanded(
            child: rows.when(
              loading: () => ListView(
                padding: const EdgeInsets.all(16),
                children: List.generate(
                  7,
                  (_) => const Padding(
                    padding: EdgeInsets.only(bottom: 10),
                    child: SkeletonBox(height: 62, radius: 18),
                  ),
                ),
              ),
              error: (error, _) => StateView.error(
                ApiError.from(error).message,
                action: FilledButton(
                  onPressed: () =>
                      ref.invalidate(consolidatedProvider(_subjectId)),
                  child: const Text('Reintentar'),
                ),
              ),
              data: (items) {
                final term = _query.trim().toLowerCase();
                final filtered = term.isEmpty
                    ? items
                    : items
                        .where((row) =>
                            row.fullName.toLowerCase().contains(term) ||
                            row.code.toLowerCase().contains(term))
                        .toList();

                if (items.isEmpty) {
                  return StateView.empty(
                    'Sin notas registradas en este periodo.\n'
                    'Cuando captures la primera, el consolidado aparecerá aquí.',
                  );
                }
                if (filtered.isEmpty) {
                  return StateView.empty('Sin coincidencias para "$_query".');
                }

                return RefreshIndicator(
                  onRefresh: () async {
                    ref.invalidate(consolidatedProvider(_subjectId));
                    await ref.read(consolidatedProvider(_subjectId).future);
                  },
                  child: ListView(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                    children: [
                      _Summary(rows: items),
                      const SizedBox(height: 14),
                      for (final row in filtered) ...[
                        _GradeRow(row: row),
                        const SizedBox(height: 10),
                      ],
                      const SizedBox(height: 6),
                      Text(
                        'En cursiva, los cortes con componentes pendientes de calificar.',
                        style: TextStyle(fontSize: 11.5, color: muted),
                      ),
                    ],
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _Summary extends StatelessWidget {
  final List<ConsolidatedRow> rows;
  const _Summary({required this.rows});

  @override
  Widget build(BuildContext context) {
    final graded = rows.where((row) => row.finalGrade > 0).toList();
    final average = graded.isEmpty
        ? 0.0
        : graded.map((r) => r.finalGrade).reduce((a, b) => a + b) /
            graded.length;
    final passing = graded.where((row) => row.passed).length;
    final complete = rows.where((row) => row.complete).length;

    return Row(
      children: [
        Expanded(
          child: StatTile(
            label: 'Promedio',
            value: average == 0 ? '—' : average.toStringAsFixed(2),
            hint: 'del grupo',
            valueColor: average >= 3 ? AppColors.success : AppColors.danger,
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: StatTile(
            label: 'Aprobando',
            value: '$passing',
            hint: 'de ${graded.length}',
            valueColor: AppColors.success,
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: StatTile(
            label: 'Completos',
            value: '$complete',
            hint: 'los 3 cortes',
            valueColor: AppColors.info,
          ),
        ),
      ],
    );
  }
}

class _GradeRow extends StatelessWidget {
  final ConsolidatedRow row;
  const _GradeRow({required this.row});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final muted = isDark ? AppColors.textMutedDark : AppColors.textMuted;
    final hasGrades = row.finalGrade > 0;

    return AppCard(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(row.fullName,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                            fontWeight: FontWeight.w600, fontSize: 14.5)),
                    Text(row.code,
                        style: TextStyle(fontSize: 11.5, color: muted)),
                  ],
                ),
              ),
              if (hasGrades)
                StatusPill(
                  row.passed ? 'Aprobando' : 'Reprobando',
                  color: row.passed ? AppColors.success : AppColors.danger,
                  background:
                      row.passed ? AppColors.successSoft : AppColors.dangerSoft,
                ),
              const SizedBox(width: 10),
              Text(
                hasGrades ? row.finalGrade.toStringAsFixed(2) : '—',
                style: TextStyle(
                  fontSize: 19,
                  fontWeight: FontWeight.w800,
                  color: !hasGrades
                      ? muted
                      : (row.passed ? AppColors.success : AppColors.danger),
                ),
              ),
            ],
          ),
          if (row.cuts.isNotEmpty) ...[
            const SizedBox(height: 10),
            Row(
              children: [
                for (final cut in row.cuts)
                  Expanded(
                    child: Column(
                      children: [
                        Text('C${cut.cut}',
                            style: TextStyle(fontSize: 10.5, color: muted)),
                        const SizedBox(height: 3),
                        Text(
                          cut.grade.toStringAsFixed(1),
                          style: TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w700,
                            fontStyle: cut.complete
                                ? FontStyle.normal
                                : FontStyle.italic,
                            color: cut.complete ? null : muted,
                          ),
                        ),
                      ],
                    ),
                  ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}
