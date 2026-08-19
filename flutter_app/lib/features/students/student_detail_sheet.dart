import 'package:flutter/material.dart';

import '../../core/data/models.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/compact.dart';
import '../../core/widgets/ui_kit.dart';
import './widgets/student_timeline_sheet.dart';

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
    final cuts = entry.grades?.cuts ?? const <CutSummary>[];

    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.62,
      maxChildSize: 0.92,
      minChildSize: 0.4,
      builder: (_, controller) => ListView(
        controller: controller,
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.page,
          0,
          AppSpacing.page,
          AppSpacing.page + AppSpacing.gap,
        ),
        children: [
          // Identidad en una sola fila de 40 dp: el avatar de 52 y el título
          // en `h3` gastaban 96 antes de la primera cifra útil, y quien abre
          // esta ficha ya sabe a quién ha tocado.
          Row(
            children: [
              InitialsAvatar(entry.student.fullName, size: 36),
              const SizedBox(width: AppSpacing.gap),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      entry.student.fullName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppType.bodyStrong.copyWith(fontWeight: FontWeight.w800),
                    ),
                    Text(
                      [
                        'Cédula ${entry.student.code}',
                        if (entry.student.program.isNotEmpty) entry.student.program,
                      ].join(' · '),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppType.caption.copyWith(color: muted),
                    ),
                  ],
                ),
              ),
              // El historial se abre desde aquí y no desde otra pantalla: es
              // la ficha del estudiante, y llegar a su cronología no debería
              // costar salir de ella.
              IconButton(
                onPressed: () => showStudentTimelineSheet(
                  context,
                  studentId: entry.student.id,
                  nombre: entry.student.fullName,
                ),
                icon: const Icon(Icons.history_outlined),
                tooltip: 'Ver historial académico',
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.gap),

          // El motivo del riesgo va primero y completo: de esta ficha depende
          // que el docente decida contactar al estudiante, y un color solo no
          // justifica esa decisión.
          if (entry.risk != null && entry.riskLevel != RiskLevel.low) ...[
            RiskBadge(entry.riskLevel.name),
            const SizedBox(height: 8),
            if (entry.risk!.reasons.isNotEmpty)
              AppCard(
                padding: const EdgeInsets.all(AppSpacing.gap),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'POR QUÉ ESTÁ EN RIESGO',
                      style: AppType.captionStrong.copyWith(
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
                                  style: AppType.caption.copyWith(height: 1.4)),
                            ),
                          ],
                        ),
                      ),
                  ],
                ),
              ),
            const SizedBox(height: AppSpacing.gap),
          ],

          Row(
            children: [
              Expanded(
                child: CompactStat(
                  etiqueta: 'Nota final',
                  valor: (entry.finalGrade ?? 0) == 0
                      ? '—'
                      : entry.finalGrade!.toStringAsFixed(2),
                  pista: entry.grades?.complete == true
                      ? 'los 3 cortes completos'
                      : 'aún en curso',
                  // La nota y el umbral los calcula el backend; aquí solo se
                  // elige el par de colores que representa el resultado.
                  tono: (entry.finalGrade ?? 0) >= 3
                      ? SemanticKind.success
                      : SemanticKind.danger,
                ),
              ),
              const SizedBox(width: AppSpacing.gapSm),
              Expanded(
                child: CompactStat(
                  etiqueta: 'Asistencia',
                  valor: entry.attendanceRate == null
                      ? '—'
                      : '${entry.attendanceRate!.toStringAsFixed(0)}%',
                  pista: entry.risk == null
                      ? 'sin registros'
                      : '${entry.risk!.missed} faltas',
                  tono: (entry.attendanceRate ?? 100) >= 80
                      ? SemanticKind.info
                      : SemanticKind.warning,
                ),
              ),
            ],
          ),

          if (cuts.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.gap),
            Text(
              'DESGLOSE POR CORTE',
              style: AppType.captionStrong.copyWith(
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
                  padding:
                      const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                  child: Row(
                    children: [
                      SizedBox(
                        width: 74,
                        child: Text('Corte ${cut.cut}',
                            style:
                                const TextStyle(fontWeight: FontWeight.w600)),
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
              style: AppType.caption.copyWith(color: muted),
            ),
          ],
        ],
      ),
    );
  }

}
