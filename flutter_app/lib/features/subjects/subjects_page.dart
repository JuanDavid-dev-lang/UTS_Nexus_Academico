import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/data/models.dart';
import '../../core/data/providers.dart';
import '../../core/network/api_error.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/period_selector.dart';
import '../../core/widgets/ui_kit.dart';

/// Listado de materias — punto de entrada a los estudiantes.
///
/// La versión anterior tenía "Estudiantes" como una lista plana de todos los
/// alumnos del docente. Eso no coincide con cómo se trabaja: un docente piensa
/// "mis estudiantes de Cálculo I", no "todos mis estudiantes". Aquí la materia
/// es el contenedor y los estudiantes viven dentro de ella.
class SubjectsPage extends ConsumerWidget {
  const SubjectsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final subjects = ref.watch(periodSubjectsProvider);
    final period = ref.watch(selectedPeriodProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Mis materias'),
        actions: const [PeriodSelector()],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(subjectsProvider);
          await ref.read(subjectsProvider.future);
        },
        child: subjects.when(
          loading: () => ListView(
            padding: const EdgeInsets.all(16),
            children: const [
              SkeletonBox(height: 108, radius: 18),
              SizedBox(height: 12),
              SkeletonBox(height: 108, radius: 18),
              SizedBox(height: 12),
              SkeletonBox(height: 108, radius: 18),
            ],
          ),
          error: (error, _) => ListView(
            children: [
              const SizedBox(height: 60),
              StateView.error(
                ApiError.from(error).message,
                action: FilledButton(
                  onPressed: () => ref.invalidate(subjectsProvider),
                  child: const Text('Reintentar'),
                ),
              ),
            ],
          ),
          data: (items) {
            if (items.isEmpty) {
              return ListView(
                children: [
                  const SizedBox(height: 60),
                  StateView.empty(
                    'No tienes materias en el periodo $period.\n'
                    'Cambia de periodo o pide que te asignen una.',
                  ),
                ],
              );
            }

            return ListView.separated(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
              itemCount: items.length,
              separatorBuilder: (_, __) => const SizedBox(height: 12),
              itemBuilder: (_, index) => _SubjectCard(subject: items[index]),
            );
          },
        ),
      ),
    );
  }
}

class _SubjectCard extends ConsumerWidget {
  final Subject subject;
  const _SubjectCard({required this.subject});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final stats = ref.watch(subjectStatsProvider(subject.id));
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final muted = isDark ? AppColors.textMutedDark : AppColors.textMuted;
    final primary = Theme.of(context).colorScheme.primary;

    return AppCard(
      onTap: () => context.go('/subjects/${subject.id}'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                height: 44,
                width: 44,
                decoration: BoxDecoration(
                  color: primary.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Icon(Icons.menu_book, color: primary, size: 22),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      subject.name,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                          fontSize: 16, fontWeight: FontWeight.w700),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '${subject.code} · ${subject.credits} créditos',
                      style: TextStyle(fontSize: 12.5, color: muted),
                    ),
                  ],
                ),
              ),
              Icon(Icons.chevron_right, color: muted),
            ],
          ),
          const SizedBox(height: 14),
          stats.when(
            loading: () => const Row(
              children: [
                SkeletonBox(height: 22, width: 96, radius: 999),
                SizedBox(width: 8),
                SkeletonBox(height: 22, width: 96, radius: 999),
              ],
            ),
            // Un fallo al contar no debe ocultar la materia: la tarjeta sigue
            // siendo navegable, solo sin las cifras.
            error: (_, __) => Text(
              'No se pudieron cargar las cifras',
              style: TextStyle(fontSize: 12, color: muted),
            ),
            data: (data) => Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                StatusPill('${data.students} estudiantes'),
                if (data.averageGrade > 0)
                  StatusPill(
                    'Promedio ${data.averageGrade.toStringAsFixed(2)}',
                    color: data.averageGrade >= 3
                        ? AppColors.success
                        : AppColors.danger,
                    background: data.averageGrade >= 3
                        ? AppColors.successSoft
                        : AppColors.dangerSoft,
                  ),
                if (data.atRisk > 0)
                  StatusPill.warning('${data.atRisk} en riesgo'),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
