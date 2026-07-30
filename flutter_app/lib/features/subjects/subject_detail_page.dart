import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/data/models.dart';
import '../../core/data/providers.dart';
import '../../core/network/api_error.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/ui_kit.dart';
import '../students/student_detail_sheet.dart';

/// Estudiantes de una materia.
///
/// Todo lo que el docente necesita de un estudiante —nota, asistencia y nivel de
/// riesgo— está en la misma fila. Antes había que cruzar tres pantallas
/// distintas para reunir esa información.
///
/// El orden no es alfabético: quien está en riesgo alto aparece primero. La
/// lista está para decidir a quién ayudar, no para pasar lista.
class SubjectDetailPage extends ConsumerStatefulWidget {
  final String subjectId;
  const SubjectDetailPage({super.key, required this.subjectId});

  @override
  ConsumerState<SubjectDetailPage> createState() => _SubjectDetailPageState();
}

class _SubjectDetailPageState extends ConsumerState<SubjectDetailPage> {
  String _query = '';
  RiskLevel? _riskFilter;

  @override
  Widget build(BuildContext context) {
    final roster = ref.watch(subjectRosterProvider(widget.subjectId));
    final subject = ref.watch(subjectsProvider).maybeWhen(
          data: (items) => items.where((s) => s.id == widget.subjectId).firstOrNull,
          orElse: () => null,
        );

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_outlined),
          onPressed: () => context.go('/subjects'),
        ),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              subject?.name ?? 'Materia',
              style: AppType.bodyStrong.copyWith(fontWeight: FontWeight.w700),
            ),
            if (subject != null)
              Text(
                '${subject.code} · ${ref.watch(selectedPeriodProvider)}',
                style: AppType.caption,
              ),
          ],
        ),
      ),
      body: roster.when(
        loading: () => ListView(
          padding: AppSpacing.pagePadding,
          children: List.generate(
            6,
            (_) => const Padding(
              padding: EdgeInsets.only(bottom: 12),
              child: SkeletonBox(height: 76, radius: 18),
            ),
          ),
        ),
        error: (error, _) => StateView.error(
          ApiError.from(error).message,
          action: FilledButton(
            onPressed: () => ref.invalidate(subjectRosterProvider(widget.subjectId)),
            child: const Text('Reintentar'),
          ),
        ),
        data: (students) {
          if (students.isEmpty) {
            return StateView.empty(
              'Todavía no hay estudiantes matriculados en esta materia '
              'para el periodo seleccionado.',
            );
          }

          final filtered = students.where((entry) {
            if (_riskFilter != null && entry.riskLevel != _riskFilter) return false;
            if (_query.isEmpty) return true;
            final term = _query.toLowerCase();
            return entry.student.fullName.toLowerCase().contains(term) ||
                entry.student.code.toLowerCase().contains(term);
          }).toList();

          final atRisk =
              students.where((s) => s.riskLevel != RiskLevel.low).length;

          return RefreshIndicator(
            onRefresh: () async {
              ref.invalidate(subjectRosterProvider(widget.subjectId));
              await ref.read(subjectRosterProvider(widget.subjectId).future);
            },
            child: ListView(
              padding: AppSpacing.pagePadding,
              children: [
                _SummaryStrip(students: students),
                const SizedBox(height: 14),
                TextField(
                  onChanged: (value) => setState(() => _query = value),
                  decoration: const InputDecoration(
                    hintText: 'Buscar por nombre o cédula…',
                    prefixIcon: Icon(Icons.search_outlined),
                    isDense: true,
                  ),
                ),
                const SizedBox(height: 12),
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [
                      _FilterChip(
                        label: 'Todos (${students.length})',
                        selected: _riskFilter == null,
                        onTap: () => setState(() => _riskFilter = null),
                      ),
                      const SizedBox(width: 8),
                      _FilterChip(
                        label: 'En riesgo ($atRisk)',
                        selected: _riskFilter == RiskLevel.high,
                        onTap: () => setState(() => _riskFilter =
                            _riskFilter == RiskLevel.high ? null : RiskLevel.high),
                      ),
                      const SizedBox(width: 8),
                      _FilterChip(
                        label: 'Seguimiento',
                        selected: _riskFilter == RiskLevel.medium,
                        onTap: () => setState(() => _riskFilter =
                            _riskFilter == RiskLevel.medium ? null : RiskLevel.medium),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 14),
                if (filtered.isEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 40),
                    child: StateView.empty(
                      _query.isEmpty
                          ? 'Ningún estudiante en esta categoría.'
                          : 'Sin coincidencias para "$_query".',
                    ),
                  )
                else
                  for (final entry in filtered) ...[
                    _StudentRow(
                      entry: entry,
                      subjectId: widget.subjectId,
                    ),
                    const SizedBox(height: 10),
                  ],
              ],
            ),
          );
        },
      ),
    );
  }
}

/// Cifras del grupo, arriba del todo.
class _SummaryStrip extends StatelessWidget {
  final List<SubjectStudent> students;
  const _SummaryStrip({required this.students});

  @override
  Widget build(BuildContext context) {
    final graded = students.where((s) => (s.finalGrade ?? 0) > 0).toList();
    final average = graded.isEmpty
        ? 0.0
        : graded.map((s) => s.finalGrade!).reduce((a, b) => a + b) / graded.length;
    final passing = graded.where((s) => s.isPassing == true).length;
    final atRisk = students.where((s) => s.riskLevel != RiskLevel.low).length;

    return Row(
      children: [
        Expanded(
          child: StatTile(
            label: 'Promedio',
            value: average == 0 ? '—' : average.toStringAsFixed(2),
            hint: 'del grupo',
            tone: average >= 3 ? SemanticKind.success : SemanticKind.danger,
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: StatTile(
            label: 'Aprobando',
            value: '$passing',
            hint: 'de ${graded.length} con notas',
            tone: SemanticKind.success,
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: StatTile(
            label: 'En riesgo',
            value: '$atRisk',
            hint: 'requieren atención',
            tone: atRisk == 0 ? SemanticKind.success : SemanticKind.warning,
          ),
        ),
      ],
    );
  }
}

class _FilterChip extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;

  const _FilterChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return ChoiceChip(
      label: Text(label),
      selected: selected,
      onSelected: (_) => onTap(),
      showCheckmark: false,
    );
  }
}

class _StudentRow extends StatelessWidget {
  final SubjectStudent entry;
  final String subjectId;

  const _StudentRow({required this.entry, required this.subjectId});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final muted = isDark ? AppColors.textMutedDark : AppColors.textMuted;
    final style = RiskStyle.from(context, entry.riskLevel.name);
    final grade = entry.finalGrade;

    return AppCard(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      onTap: () => showStudentDetailSheet(
        context,
        entry: entry,
        subjectId: subjectId,
      ),
      child: Row(
        children: [
          // Franja de color a la izquierda: identifica el riesgo sin ocupar
          // ancho, que en un teléfono es lo escaso.
          Container(
            width: 4,
            height: 46,
            decoration: BoxDecoration(
              color: entry.riskLevel == RiskLevel.low
                  ? Colors.transparent
                  : style.color,
              borderRadius: BorderRadius.circular(999),
            ),
          ),
          const SizedBox(width: 12),
          CircleAvatar(
            radius: 20,
            backgroundColor: Theme.of(context).colorScheme.primary.withValues(alpha: 0.12),
            child: Text(
              _initials(entry.student.fullName),
              style: AppType.captionStrong.copyWith(
                fontWeight: FontWeight.w700,
                color: Theme.of(context).colorScheme.primary,
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  entry.student.fullName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppType.bodyStrong,
                ),
                const SizedBox(height: 2),
                Text(
                  entry.attendanceRate == null
                      ? entry.student.code
                      : '${entry.student.code} · asistencia ${entry.attendanceRate!.toStringAsFixed(0)}%',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppType.caption.copyWith(color: muted),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                grade == null || grade == 0 ? '—' : grade.toStringAsFixed(2),
                style: AppType.bodyStrong.copyWith(
                  fontWeight: FontWeight.w800,
                  color: grade == null || grade == 0
                      ? muted
                      : (grade >= 3 ? AppColors.success : AppColors.danger),
                ),
              ),
              if (entry.riskLevel != RiskLevel.low)
                Text(
                  style.label,
                  style: AppType.captionStrong.copyWith(
                    fontWeight: FontWeight.w700,
                    color: style.color,
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }

  static String _initials(String name) {
    final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
    if (parts.isEmpty) return '?';
    if (parts.length == 1) return parts.first.substring(0, 1).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
}
