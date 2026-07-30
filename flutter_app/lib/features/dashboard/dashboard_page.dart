import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/data/models.dart';
import '../../core/data/providers.dart';
import '../../core/models/dashboard_summary.dart';
import '../../core/network/api_error.dart';
import '../../core/services/auth_controller.dart';
import '../../core/services/auth_repository.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/period_selector.dart';
import '../../core/widgets/ui_kit.dart';

final dashboardProvider = FutureProvider<DashboardData>((ref) async {
  return ref.read(authRepositoryProvider).dashboard();
});

/// Panel del docente.
///
/// Responde tres preguntas en orden de urgencia: cómo va el grupo, quién
/// necesita ayuda ahora, y cómo está la asistencia. Lo demás tiene su pantalla.
class DashboardPage extends ConsumerWidget {
  const DashboardPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final dashboard = ref.watch(dashboardProvider);
    final risks = ref.watch(risksProvider);
    final user = ref.watch(authControllerProvider).user;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final muted = isDark ? AppColors.textMutedDark : AppColors.textMuted;

    final firstName = (user?.fullName ?? 'Docente').split(' ').first;

    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Hola, $firstName',
                style: AppType.h3.copyWith(fontWeight: FontWeight.w800)),
            Text(
              'Estado actual de tus grupos',
              style: AppType.caption.copyWith(color: muted),
            ),
          ],
        ),
        actions: const [PeriodSelector()],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(dashboardProvider);
          ref.invalidate(risksProvider);
          await ref.read(dashboardProvider.future);
        },
        child: ListView(
          padding: AppSpacing.pagePadding,
          children: [
            dashboard.when(
              loading: () => const SkeletonStatGrid(count: 6),
              error: (error, _) => StateView.error(
                ApiError.from(error).message,
                action: FilledButton(
                  onPressed: () => ref.invalidate(dashboardProvider),
                  child: const Text('Reintentar'),
                ),
              ),
              data: (data) => _MetricsGrid(summary: data.summary),
            ),
            const SizedBox(height: 22),
            SectionHeader(
              'Necesitan atención',
              subtitle: 'Ordenados por nivel de riesgo',
              trailing: TextButton(
                onPressed: () => context.go('/notifications'),
                child: const Text('Alertas'),
              ),
            ),
            const SizedBox(height: 10),
            risks.when(
              loading: () => Column(
                children: List.generate(
                  3,
                  (_) => const Padding(
                    padding: EdgeInsets.only(bottom: 10),
                    child: SkeletonBox(height: 66, radius: 18),
                  ),
                ),
              ),
              error: (error, _) => StateView.error(
                ApiError.from(error).message,
                action: FilledButton(
                  onPressed: () => ref.invalidate(risksProvider),
                  child: const Text('Reintentar'),
                ),
              ),
              data: (items) {
                final atRisk = items
                    .where((r) => r.level != RiskLevel.low)
                    .take(6)
                    .toList();
                if (atRisk.isEmpty) {
                  return AppCard(
                    child: Row(
                      children: [
                        const Icon(Icons.check_circle_outline,
                            color: AppColors.success),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Text(
                            'Ningún estudiante en riesgo. Todos están dentro de '
                            'los parámetros esperados.',
                            style: AppType.caption.copyWith(color: muted),
                          ),
                        ),
                      ],
                    ),
                  );
                }
                return Column(
                  children: [
                    for (final risk in atRisk)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 10),
                        child: _RiskRow(risk: risk),
                      ),
                  ],
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}

class _MetricsGrid extends StatelessWidget {
  final DashboardSummary summary;
  const _MetricsGrid({required this.summary});

  @override
  Widget build(BuildContext context) {
    return GridView.count(
      crossAxisCount: 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      crossAxisSpacing: 12,
      mainAxisSpacing: 12,
      childAspectRatio: 1.45,
      children: [
        StatTile(
          label: 'Promedio',
          value: summary.averageGrade.toStringAsFixed(2),
          hint: 'sobre cortes calificados',
          icon: Icons.school_outlined,
          tone: summary.averageGrade >= 3
              ? SemanticKind.success
              : SemanticKind.danger,
        ),
        StatTile(
          label: 'Aprobados',
          value: '${summary.approvedStudents}',
          hint: 'proyección al día',
          icon: Icons.check_circle_outline,
          tone: SemanticKind.success,
        ),
        StatTile(
          label: 'Reprobados',
          value: '${summary.failedStudents}',
          hint: 'al menos una materia',
          icon: Icons.cancel_outlined,
          tone: SemanticKind.danger,
        ),
        StatTile(
          label: 'En riesgo',
          value: '${summary.riskStudents}',
          hint: 'requieren seguimiento',
          icon: Icons.warning_amber_outlined,
          tone: SemanticKind.warning,
        ),
        StatTile(
          label: 'Asistencia',
          value: '${summary.averageAttendance.toStringAsFixed(0)}%',
          hint: 'ponderada por minutos',
          icon: Icons.event_available_outlined,
          tone: SemanticKind.info,
        ),
        StatTile(
          label: 'Estudiantes',
          value: '${summary.totalStudents}',
          hint: '${summary.totalSubjects} materias',
          icon: Icons.people_outline,
        ),
      ],
    );
  }
}

class _RiskRow extends StatelessWidget {
  final RiskItem risk;
  const _RiskRow({required this.risk});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final muted = isDark ? AppColors.textMutedDark : AppColors.textMuted;
    final style = RiskStyle.from(context, risk.level.name);

    return AppCard(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      child: Row(
        children: [
          Container(
            width: 4,
            height: 42,
            decoration: BoxDecoration(
              color: style.color,
              borderRadius: BorderRadius.circular(999),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(risk.fullName,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppType.bodyStrong),
                const SizedBox(height: 2),
                // El motivo, no solo el color: de esto depende que el docente
                // decida intervenir.
                Text(
                  risk.reasons.isNotEmpty
                      ? risk.reasons.first
                      : 'Nota ${risk.finalGrade.toStringAsFixed(2)} · '
                          'asistencia ${risk.attendanceRate.toStringAsFixed(0)}%',
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: AppType.caption.copyWith(color: muted, height: 1.3),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Text(
            style.label,
            style: AppType.captionStrong.copyWith(
              fontWeight: FontWeight.w800,
              color: style.color,
            ),
          ),
        ],
      ),
    );
  }
}
