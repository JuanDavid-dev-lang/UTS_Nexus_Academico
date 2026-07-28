import 'package:flutter/material.dart';

import '../../core/data/models.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/ui_kit.dart';

/// Ficha de un estudiante dentro de una materia.
///
/// Se abre como hoja inferior en vez de como pantalla nueva: es información de
/// consulta rápida y el docente vuelve enseguida a la lista. Una navegación
/// completa le costaría dos toques más por cada estudiante que revisa.
Future<void> showStudentDetailSheet(
  BuildContext context, {
  required SubjectStudent entry,
  required String subjectId,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (_) => _StudentDetailSheet(entry: entry),
  );
}

class _StudentDetailSheet extends StatelessWidget {
  final SubjectStudent entry;
  const _StudentDetailSheet({required this.entry});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final muted = isDark ? AppColors.textMutedDark : AppColors.textMuted;
    final primary = Theme.of(context).colorScheme.primary;
    final cuts = entry.grades?.cuts ?? const <CutSummary>[];

    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.62,
      maxChildSize: 0.92,
      minChildSize: 0.4,
      builder: (_, controller) => ListView(
        controller: controller,
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 28),
        children: [
          Row(
            children: [
              CircleAvatar(
                radius: 26,
                backgroundColor: primary.withValues(alpha: 0.12),
                child: Text(
                  _initials(entry.student.fullName),
                  style: TextStyle(
                    fontWeight: FontWeight.w800,
                    color: primary,
                    fontSize: 16,
                  ),
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      entry.student.fullName,
                      style: const TextStyle(
                          fontSize: 18, fontWeight: FontWeight.w800),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      'Cédula ${entry.student.code}',
                      style: TextStyle(fontSize: 13, color: muted),
                    ),
                    if (entry.student.program.isNotEmpty)
                      Text(
                        entry.student.program,
                        style: TextStyle(fontSize: 12, color: muted),
                      ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 18),

          // El motivo del riesgo va primero y completo: de esta ficha depende
          // que el docente decida contactar al estudiante, y un color solo no
          // justifica esa decisión.
          if (entry.risk != null && entry.riskLevel != RiskLevel.low) ...[
            RiskBadge(entry.riskLevel.name),
            const SizedBox(height: 8),
            if (entry.risk!.reasons.isNotEmpty)
              AppCard(
                padding: const EdgeInsets.all(14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'POR QUÉ ESTÁ EN RIESGO',
                      style: TextStyle(
                        fontSize: 10.5,
                        letterSpacing: 0.8,
                        fontWeight: FontWeight.w700,
                        color: muted,
                      ),
                    ),
                    const SizedBox(height: 8),
                    for (final reason in entry.risk!.reasons)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 6),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text('•  '),
                            Expanded(
                              child: Text(reason,
                                  style: const TextStyle(fontSize: 13, height: 1.4)),
                            ),
                          ],
                        ),
                      ),
                  ],
                ),
              ),
            const SizedBox(height: 18),
          ],

          Row(
            children: [
              Expanded(
                child: StatTile(
                  label: 'Nota final',
                  value: (entry.finalGrade ?? 0) == 0
                      ? '—'
                      : entry.finalGrade!.toStringAsFixed(2),
                  hint: entry.grades?.complete == true
                      ? 'los 3 cortes completos'
                      : 'aún en curso',
                  valueColor: (entry.finalGrade ?? 0) >= 3
                      ? AppColors.success
                      : AppColors.danger,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: StatTile(
                  label: 'Asistencia',
                  value: entry.attendanceRate == null
                      ? '—'
                      : '${entry.attendanceRate!.toStringAsFixed(0)}%',
                  hint: entry.risk == null
                      ? 'sin registros'
                      : '${entry.risk!.missed} faltas',
                  valueColor: (entry.attendanceRate ?? 100) >= 80
                      ? AppColors.info
                      : AppColors.warningText,
                ),
              ),
            ],
          ),

          if (cuts.isNotEmpty) ...[
            const SizedBox(height: 20),
            Text(
              'DESGLOSE POR CORTE',
              style: TextStyle(
                fontSize: 10.5,
                letterSpacing: 0.8,
                fontWeight: FontWeight.w700,
                color: muted,
              ),
            ),
            const SizedBox(height: 10),
            for (final cut in cuts)
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: AppCard(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                  child: Row(
                    children: [
                      SizedBox(
                        width: 74,
                        child: Text('Corte ${cut.cut}',
                            style: const TextStyle(fontWeight: FontWeight.w600)),
                      ),
                      Expanded(
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(999),
                          child: LinearProgressIndicator(
                            value: (cut.grade / 5).clamp(0, 1),
                            minHeight: 7,
                            color: cut.grade >= 3
                                ? AppColors.success
                                : AppColors.danger,
                            backgroundColor: isDark
                                ? AppColors.surfaceAltDark
                                : AppColors.surfaceAlt,
                          ),
                        ),
                      ),
                      const SizedBox(width: 12),
                      SizedBox(
                        width: 42,
                        child: Text(
                          cut.grade.toStringAsFixed(1),
                          textAlign: TextAlign.end,
                          style: TextStyle(
                            fontWeight: FontWeight.w800,
                            // El cursiva marca "todavía faltan componentes":
                            // un 2.0 incompleto no significa lo mismo que un
                            // 2.0 definitivo.
                            fontStyle: cut.complete
                                ? FontStyle.normal
                                : FontStyle.italic,
                            color: cut.complete ? null : muted,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            Text(
              'En cursiva, los cortes a los que aún les faltan componentes por calificar.',
              style: TextStyle(fontSize: 11.5, color: muted),
            ),
          ],
        ],
      ),
    );
  }

  static String _initials(String name) {
    final parts =
        name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
    if (parts.isEmpty) return '?';
    if (parts.length == 1) return parts.first.substring(0, 1).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
}
