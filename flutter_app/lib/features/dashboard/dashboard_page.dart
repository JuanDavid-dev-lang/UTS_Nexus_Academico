import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/services/auth_controller.dart';
import '../../core/services/auth_repository.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/ui_kit.dart';

final dashboardProvider = FutureProvider<DashboardData>((ref) async {
  return ref.read(authRepositoryProvider).dashboard();
});

class DashboardPage extends ConsumerWidget {
  const DashboardPage({super.key});

  String _roleLabel(String? role) {
    return switch (role) {
      'ADMIN' => 'Administrador',
      'COORDINATOR' => 'Coordinación',
      _ => 'Profesor',
    };
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(dashboardProvider);
    final auth = ref.watch(authControllerProvider);
    final user = auth.user;
    final userLabel = user == null ? 'UTS' : '${_roleLabel(user.role)} • ${user.fullName}';

    return Scaffold(
      body: SafeArea(
        child: async.when(
          loading: () => const StateView(
              icon: Icons.hourglass_empty,
              title: 'Un momento',
              message: 'Cargando el panel académico…'),
          error: (e, _) => StateView.error('$e',
              action: FilledButton(
                onPressed: () => ref.invalidate(dashboardProvider),
                child: const Text('Reintentar'),
              )),
          data: (data) => RefreshIndicator(
            onRefresh: () async => ref.invalidate(dashboardProvider),
            child: SingleChildScrollView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.all(18),
              child: Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 1400),
                  child: LayoutBuilder(builder: (context, constraints) {
                    final wide = constraints.maxWidth >= 1100;
                    final s = data.summary;
                    return Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        SectionHeader(
                          'Dashboard académico',
                          subtitle: 'Resumen de rendimiento, riesgo y asistencia',
                          trailing: _UserPill(userLabel),
                        ),
                        const SizedBox(height: 16),
                        Wrap(
                          spacing: 14,
                          runSpacing: 14,
                          children: [
                            _metric('Promedio', s.averageGrade.toStringAsFixed(2),
                                AppColors.primary, 'Sobre cortes calificados', Icons.trending_up),
                            _metric('Aprobados', '${s.approvedStudents}',
                                AppColors.success, 'Estudiantes al día', Icons.check_circle_outline),
                            _metric('Reprobados', '${s.failedStudents}',
                                AppColors.danger, 'En observación', Icons.cancel_outlined),
                            _metric('En riesgo', '${s.riskStudents}',
                                AppColors.warningText, 'Alertas activas', Icons.warning_amber_rounded),
                            _metric('Asistencia', '${s.averageAttendance.toStringAsFixed(0)}%',
                                AppColors.info, 'Ponderada por minutos', Icons.event_available),
                            _metric('Materias críticas', '${s.criticalSubjects}',
                                AppColors.warningText, 'Necesitan seguimiento', Icons.report_problem_outlined),
                          ],
                        ),
                        const SizedBox(height: 16),
                        Flex(
                          direction: wide ? Axis.horizontal : Axis.vertical,
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Expanded(
                              flex: 2,
                              child: AppCard(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: const [
                                    Text('Actividad reciente',
                                        style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                                    SizedBox(height: 12),
                                    _FeedItem('Nueva nota registrada'),
                                    _FeedItem('Un estudiante entró en zona de riesgo'),
                                    _FeedItem('Asistencia actualizada'),
                                    _FeedItem('Reporte exportado correctamente'),
                                  ],
                                ),
                              ),
                            ),
                            const SizedBox(width: 14, height: 14),
                            Expanded(
                              child: AppCard(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    const Text('Resumen',
                                        style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                                    const SizedBox(height: 12),
                                    const Text(
                                      'Todo sincronizado con el backend y Atlas.',
                                      style: TextStyle(color: AppColors.textMuted),
                                    ),
                                    const SizedBox(height: 16),
                                    _MiniStat(label: 'Estudiantes', value: '${s.totalStudents}'),
                                    _MiniStat(label: 'Materias', value: '${s.totalSubjects}'),
                                    _MiniStat(label: 'En riesgo', value: '${s.riskStudents}'),
                                  ],
                                ),
                              ),
                            ),
                          ],
                        ),
                      ],
                    );
                  }),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _metric(String label, String value, Color color, String hint, IconData icon) {
    return SizedBox(
      width: 220,
      child: StatTile(label: label, value: value, hint: hint, valueColor: color, icon: icon),
    );
  }
}

class _UserPill extends StatelessWidget {
  final String label;
  const _UserPill(this.label);

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
      decoration: BoxDecoration(
        color: AppColors.surfaceAlt,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: AppColors.border),
      ),
      child: Text(label,
          style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 12.5)),
    );
  }
}

class _FeedItem extends StatelessWidget {
  final String text;
  const _FeedItem(this.text);

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: AppColors.surfaceAlt,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          const Icon(Icons.circle, size: 8, color: AppColors.primary),
          const SizedBox(width: 10),
          Expanded(child: Text(text)),
        ],
      ),
    );
  }
}

class _MiniStat extends StatelessWidget {
  final String label;
  final String value;
  const _MiniStat({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        children: [
          Text(label, style: const TextStyle(color: AppColors.textMuted)),
          const Spacer(),
          Text(value, style: const TextStyle(fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }
}
