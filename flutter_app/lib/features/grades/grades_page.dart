import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/data/models.dart';
import '../../core/data/providers.dart';
import '../../core/network/api_error.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/compact.dart';
import '../../core/widgets/period_selector.dart';
import '../../core/widgets/session_menu.dart';
import '../../core/widgets/ui_kit.dart';
import './grade_breakdown_sheet.dart';
import '../../core/widgets/debounced_search_field.dart';

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
      appBar: CompactHeader(
        titulo: 'Consolidado',
        contexto: ref.watch(selectedPeriodProvider),
        acciones: const [PeriodSelector(), SessionMenuButton()],
      ),
      body: Column(
        children: [
          Padding(
            // Cabecera fija sobre la lista: el horizontal debe ser el mismo de
            // AppSpacing.pagePadding o el selector queda desalineado del listado.
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.page,
              AppSpacing.gapSm,
              AppSpacing.page,
              AppSpacing.gapSm,
            ),
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
            child: DebouncedSearchField(
              hintText: 'Buscar estudiante…',
              onChanged: (value) => setState(() => _query = value),
            ),
          ),
          const SizedBox(height: 10),
          Expanded(
            child: rows.when(
              loading: () => ListView(
                padding: AppSpacing.listPadding,
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
                    padding: AppSpacing.listPadding,
                    children: [
                      _Summary(rows: items),
                      const SizedBox(height: 14),
                      // En la semana de cierre "qué me falta" pesa más que
                      // "cuánto sacó cada uno".
                      _PendingBanner(subjectId: _subjectId),
                      for (final row in filtered) ...[
                        _GradeRow(
                          row: row,
                          // Tocar la fila abre de qué notas sale cada promedio,
                          // que es donde se corrige la que está mal digitada.
                          onTap: () => showGradeBreakdown(
                            context,
                            row,
                            () {
                              ref.invalidate(consolidatedProvider(_subjectId));
                              // Quitar una nota devuelve ese componente a la
                              // lista de pendientes.
                              ref.invalidate(pendingGradesProvider(_subjectId));
                            },
                          ),
                        ),
                        const SizedBox(height: 10),
                      ],
                      const SizedBox(height: 6),
                      Text(
                        'En cursiva, los cortes con componentes pendientes de calificar.',
                        style: AppType.caption.copyWith(color: muted),
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

/// Aviso de trabajo pendiente.
///
/// Se calla mientras carga, si falla o si no hay nada: es una ayuda, no el
/// contenido de la pantalla, y un esqueleto aquí solo empujaría la lista hacia
/// abajo al llegar.
class _PendingBanner extends ConsumerWidget {
  final String? subjectId;
  const _PendingBanner({required this.subjectId});

  static const _shortLabels = <String, String>{
    'TRABAJOS': 'Trabajos',
    'PARCIALES': 'Parciales',
    'AUTOEVALUACION': 'Autoev.',
  };

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final pending = ref.watch(pendingGradesProvider(subjectId));

    return pending.maybeWhen(
      orElse: () => const SizedBox.shrink(),
      data: (items) {
        final conFaltantes = items.where((s) => s.missing > 0).toList();
        if (conFaltantes.isEmpty) return const SizedBox.shrink();

        final tone = SemanticTone.of(context, SemanticKind.warning);

        return Padding(
          padding: const EdgeInsets.only(bottom: 14),
          child: AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Icon(Icons.assignment_late_outlined,
                        size: 18, color: tone.fg),
                    const SizedBox(width: 8),
                    Text('Te falta por calificar',
                        style: AppType.bodyStrong.copyWith(color: tone.fg)),
                  ],
                ),
                const SizedBox(height: 8),
                for (final materia in conFaltantes) ...[
                  Text('${materia.name} · ${materia.missing} notas',
                      style: AppType.caption
                          .copyWith(fontWeight: FontWeight.w600)),
                  for (final corte
                      in materia.cuts.where((cut) => cut.missing > 0))
                    Padding(
                      padding: const EdgeInsets.only(left: 8, top: 2),
                      child: Text(
                        'Corte ${corte.cut}: '
                        '${corte.components.where((c) => c.missing > 0).map((c) => '${_shortLabels[c.component] ?? c.component} ${c.missing}/${c.total}').join(' · ')}',
                        style: AppType.caption,
                      ),
                    ),
                  const SizedBox(height: 6),
                ],
              ],
            ),
          ),
        );
      },
    );
  }
}

class _Summary extends StatelessWidget {
  final List<ConsolidatedRow> rows;
  const _Summary({required this.rows});

  @override
  Widget build(BuildContext context) {
    final graded = rows.where((row) => row.cuts.any((cut) => cut.complete || cut.grade > 0)).toList();
    final average = graded.isEmpty
        ? 0.0
        : graded.map((r) => r.finalGrade).reduce((a, b) => a + b) /
            graded.length;
    final passing = graded.where((row) => row.passed).length;
    final complete = rows.where((row) => row.complete).length;

    return Row(
      children: [
        Expanded(
          child: CompactStat(
            etiqueta: 'Promedio',
            valor: average == 0 ? '—' : average.toStringAsFixed(2),
            pista: 'del grupo',
            tono: average >= 3 ? SemanticKind.success : SemanticKind.danger,
          ),
        ),
        const SizedBox(width: AppSpacing.gapSm),
        Expanded(
          child: CompactStat(
            etiqueta: 'Aprobando',
            valor: '$passing',
            pista: 'de ${graded.length}',
            tono: SemanticKind.success,
          ),
        ),
        const SizedBox(width: AppSpacing.gapSm),
        Expanded(
          child: CompactStat(
            etiqueta: 'Completos',
            valor: '$complete',
            pista: 'los 3 cortes',
            tono: SemanticKind.info,
          ),
        ),
      ],
    );
  }
}

/// Fila del consolidado.
///
/// Antes ocupaba unos 96 dp: dos líneas de identidad arriba y una franja de
/// tres columnas con los cortes debajo. En pantalla cabían seis estudiantes de
/// un grupo de cuarenta.
///
/// Ahora los cortes viajan en la línea de metadatos —«C1 3.2 · C2 2.8 · C3
/// 4.0»— y la fila baja a 56. El desglose completo, con qué componentes faltan,
/// sigue estando a un toque: es lo que abre el panel inferior, y es donde de
/// verdad se consulta.
///
/// La nota final y el «aprobando» los calcula el backend; aquí solo se elige
/// el color que los representa.
class _GradeRow extends StatelessWidget {
  final ConsolidatedRow row;
  final VoidCallback onTap;
  const _GradeRow({required this.row, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final hasGrades = row.finalGrade > 0;

    return AcademicRow(
      titulo: row.fullName,
      metadatos: [
        row.code,
        // El asterisco marca «a este corte le faltan componentes»: un 2.0
        // incompleto no significa lo mismo que un 2.0 definitivo, y en una
        // línea de texto la cursiva no se distingue.
        for (final cut in row.cuts)
          'C${cut.cut} ${cut.grade.toStringAsFixed(1)}${cut.complete ? '' : '*'}',
      ],
      indicador: MetricChip(
        hasGrades ? row.finalGrade.toStringAsFixed(2) : '—',
        etiqueta: 'Final',
        tono: !hasGrades
            ? null
            : (row.passed ? SemanticKind.success : SemanticKind.danger),
      ),
      estado: hasGrades
          ? StatusPill(
              row.passed ? 'Aprobando' : 'Reprobando',
              kind: row.passed ? SemanticKind.success : SemanticKind.danger,
            )
          : null,
      acento: hasGrades && !row.passed ? SemanticKind.danger : null,
      onTap: onTap,
    );
  }
}
