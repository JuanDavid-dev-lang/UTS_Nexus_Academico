import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/services/api_client.dart';

/// Semestre seleccionado para consultar notas.
final gradesPeriodProvider = StateProvider<String>((ref) => '2026-1');

class ConsolidatedGrade {
  final String code;
  final String fullName;
  final double notaFinal;
  final bool aprobado;
  final bool completo;
  final List<double> cortes;

  ConsolidatedGrade({
    required this.code,
    required this.fullName,
    required this.notaFinal,
    required this.aprobado,
    required this.completo,
    required this.cortes,
  });

  factory ConsolidatedGrade.fromJson(Map<String, dynamic> json) {
    final cortesRaw = (json['cortes'] as List?) ?? const [];
    return ConsolidatedGrade(
      code: (json['code'] ?? '').toString(),
      fullName: (json['fullName'] ?? '').toString(),
      notaFinal: (json['notaFinal'] as num?)?.toDouble() ?? 0,
      aprobado: json['aprobado'] == true,
      completo: json['completo'] == true,
      cortes: cortesRaw
          .map((c) => ((c as Map)['nota'] as num?)?.toDouble() ?? 0)
          .toList(),
    );
  }
}

/// Notas consolidadas por el motor del backend (30/60/10 + cortes 33/33/34).
final consolidatedGradesProvider =
    FutureProvider.autoDispose<List<ConsolidatedGrade>>((ref) async {
  final period = ref.watch(gradesPeriodProvider);
  final response =
      await ApiClient.instance.get<Map<String, dynamic>>('/grades/consolidado?period=$period');
  final items = (response.data?['items'] as List?) ?? const [];
  return items
      .map((e) => ConsolidatedGrade.fromJson(Map<String, dynamic>.from(e as Map)))
      .toList();
});

class GradesPage extends ConsumerWidget {
  const GradesPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final period = ref.watch(gradesPeriodProvider);
    final async = ref.watch(consolidatedGradesProvider);
    final colorScheme = Theme.of(context).colorScheme;

    return Scaffold(
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(18),
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 1000),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
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
                                'Notas',
                                style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                                      fontWeight: FontWeight.w800,
                                      color: colorScheme.onSurface,
                                    ),
                              ),
                              const SizedBox(height: 6),
                              Text(
                                'Nota final calculada por el backend · cortes 33/33/34',
                                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                                      color: colorScheme.onSurfaceVariant,
                                    ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(width: 16),
                        DropdownButton<String>(
                          value: period,
                          dropdownColor: const Color(0xFF121C23),
                          items: const [
                            DropdownMenuItem(value: '2026-1', child: Text('2026-1')),
                            DropdownMenuItem(value: '2026-2', child: Text('2026-2')),
                          ],
                          onChanged: (value) {
                            if (value != null) {
                              ref.read(gradesPeriodProvider.notifier).state = value;
                            }
                          },
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                  async.when(
                    data: (items) {
                      if (items.isEmpty) {
                        return const Padding(
                          padding: EdgeInsets.all(24),
                          child: Text('Sin notas registradas para este semestre.'),
                        );
                      }
                      return Column(
                        children: items.map((g) => _GradeCard(grade: g)).toList(),
                      );
                    },
                    error: (e, _) => Text('Error: $e'),
                    loading: () => const Padding(
                      padding: EdgeInsets.all(40),
                      child: Center(child: CircularProgressIndicator()),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _GradeCard extends StatelessWidget {
  final ConsolidatedGrade grade;
  const _GradeCard({required this.grade});

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final tone = grade.aprobado ? const Color(0xFF74D3B2) : const Color(0xFFFF8A8A);
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: const Color(0xFF121C23),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: const Color(0xFF20303A)),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  grade.fullName.isEmpty ? grade.code : grade.fullName,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 4),
                Text(
                  'Cédula ${grade.code}',
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(color: colorScheme.onSurfaceVariant),
                ),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  children: [
                    for (var i = 0; i < grade.cortes.length; i++)
                      _CorteChip(label: 'C${i + 1}', value: grade.cortes[i]),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(width: 12),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                grade.notaFinal.toStringAsFixed(2),
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                      fontWeight: FontWeight.w800,
                      color: tone,
                    ),
              ),
              Text(
                grade.aprobado ? 'Aprobado' : 'Reprobado',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(color: tone),
              ),
              if (!grade.completo)
                Text(
                  'Parcial',
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(color: colorScheme.onSurfaceVariant),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _CorteChip extends StatelessWidget {
  final String label;
  final double value;
  const _CorteChip({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: const Color(0xFF0F171D),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: const Color(0xFF23323C)),
      ),
      child: Text('$label: ${value.toStringAsFixed(2)}', style: Theme.of(context).textTheme.labelSmall),
    );
  }
}
