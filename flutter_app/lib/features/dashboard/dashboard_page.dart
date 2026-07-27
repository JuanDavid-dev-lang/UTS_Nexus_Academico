import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/services/auth_controller.dart';
import '../../core/services/auth_repository.dart';

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
    final colorScheme = Theme.of(context).colorScheme;
    final user = auth.user;
    final userLabel = user == null ? 'UTS' : '${_roleLabel(user.role)} • ${user.fullName}';

    return Scaffold(
      body: SafeArea(
        child: async.when(
          data: (data) => LayoutBuilder(
            builder: (context, constraints) {
              final wide = constraints.maxWidth >= 1100;
              return SingleChildScrollView(
                padding: const EdgeInsets.all(18),
                child: Center(
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 1400),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        _HeroHeader(
                          title: 'Dashboard académico',
                          subtitle: 'Resumen rápido de rendimiento, riesgo y asistencia',
                          userLabel: userLabel,
                        ),
                        const SizedBox(height: 16),
                        Wrap(
                          spacing: 14,
                          runSpacing: 14,
                          children: [
                            _MetricCard(
                              title: 'Promedio',
                              value: data.summary.averageGrade.toStringAsFixed(2),
                              tone: const Color(0xFF74D3B2),
                              hint: 'Promedio general',
                            ),
                            _MetricCard(
                              title: 'Aprobados',
                              value: data.summary.approvedStudents.toString(),
                              tone: const Color(0xFF8CE2C4),
                              hint: 'Estudiantes al día',
                            ),
                            _MetricCard(
                              title: 'Reprobados',
                              value: data.summary.failedStudents.toString(),
                              tone: const Color(0xFFFFB86B),
                              hint: 'En observación',
                            ),
                            _MetricCard(
                              title: 'Riesgo',
                              value: data.summary.riskStudents.toString(),
                              tone: const Color(0xFF8FB5FF),
                              hint: 'Alertas activas',
                            ),
                            _MetricCard(
                              title: 'Asistencia',
                              value: '${data.summary.averageAttendance.toStringAsFixed(0)}%',
                              tone: const Color(0xFF74D3B2),
                              hint: 'Promedio del grupo',
                            ),
                            _MetricCard(
                              title: 'Materias críticas',
                              value: data.summary.criticalSubjects.toString(),
                              tone: const Color(0xFFFFC86B),
                              hint: 'Necesitan seguimiento',
                            ),
                          ],
                        ),
                        const SizedBox(height: 16),
                        Flex(
                          direction: wide ? Axis.horizontal : Axis.vertical,
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Expanded(
                              flex: 2,
                              child: _SurfaceCard(
                                title: 'Actividad reciente',
                                child: Column(
                                  children: const [
                                    _FeedItem('Juan Pérez registró una nueva nota'),
                                    _FeedItem('Ana Ruiz entró en zona de riesgo'),
                                    _FeedItem('Asistencia actualizada para Grupo A'),
                                    _FeedItem('Reporte PDF exportado correctamente'),
                                  ],
                                ),
                              ),
                            ),
                            const SizedBox(width: 14, height: 14),
                            Expanded(
                              child: _SurfaceCard(
                                title: 'Resumen',
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      'Todo está sincronizado con el backend y Atlas.',
                                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                                            color: colorScheme.onSurfaceVariant,
                                          ),
                                    ),
                                    const SizedBox(height: 18),
                                    _MiniStat(label: 'Estudiantes', value: data.summary.totalStudents.toString()),
                                    _MiniStat(label: 'Materias', value: data.summary.totalSubjects.toString()),
                                    _MiniStat(label: 'Aprobación', value: '${data.summary.approvedStudents}%'),
                                  ],
                                ),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
              );
            },
          ),
          error: (e, _) => Center(child: Text('Error: $e')),
          loading: () => const Center(child: CircularProgressIndicator()),
        ),
      ),
    );
  }
}

class _HeroHeader extends StatelessWidget {
  final String title;
  final String subtitle;
  final String userLabel;

  const _HeroHeader({required this.title, required this.subtitle, required this.userLabel});

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: const Color(0xFF121C23),
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: const Color(0xFF20303A)),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                        fontWeight: FontWeight.w800,
                        color: colorScheme.onSurface,
                      ),
                ),
                const SizedBox(height: 6),
                Text(
                  subtitle,
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: colorScheme.onSurfaceVariant,
                      ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 16),
          _Pill(userLabel),
        ],
      ),
    );
  }
}

class _MetricCard extends StatelessWidget {
  final String title;
  final String value;
  final String hint;
  final Color tone;

  const _MetricCard({
    required this.title,
    required this.value,
    required this.hint,
    required this.tone,
  });

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return Container(
      width: 220,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: const Color(0xFF121C23),
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: const Color(0xFF20303A)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: Theme.of(context).textTheme.labelMedium?.copyWith(
                  color: colorScheme.onSurfaceVariant,
                  letterSpacing: 0.8,
                ),
          ),
          const SizedBox(height: 10),
          Text(
            value,
            style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                  fontWeight: FontWeight.w800,
                  color: tone,
                ),
          ),
          const SizedBox(height: 8),
          Text(
            hint,
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: colorScheme.onSurfaceVariant,
                ),
          ),
        ],
      ),
    );
  }
}

class _SurfaceCard extends StatelessWidget {
  final String title;
  final Widget child;

  const _SurfaceCard({required this.title, required this.child});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: const Color(0xFF121C23),
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: const Color(0xFF20303A)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w700,
                ),
          ),
          const SizedBox(height: 14),
          child,
        ],
      ),
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
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: const Color(0xFF0F171D),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFF23323C)),
      ),
      child: Text(text, style: Theme.of(context).textTheme.bodyMedium),
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
          Text(label, style: Theme.of(context).textTheme.bodyMedium),
          const Spacer(),
          Text(
            value,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  fontWeight: FontWeight.w700,
                ),
          ),
        ],
      ),
    );
  }
}

class _Pill extends StatelessWidget {
  final String label;
  const _Pill(this.label);

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: const Color(0xFF0F171D),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: const Color(0xFF23323C)),
      ),
      child: Text(label, style: Theme.of(context).textTheme.labelMedium),
    );
  }
}
