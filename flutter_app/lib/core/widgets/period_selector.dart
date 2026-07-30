import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/providers.dart';

/// Selector de periodo académico para la barra superior.
///
/// Escribe en un provider compartido, así que cambiar de semestre aquí lo cambia
/// en materias, notas, asistencia y reportes a la vez. Tener un selector propio
/// por pantalla obligaba a repetir el cambio y permitía que dos pantallas
/// mostraran semestres distintos al mismo tiempo.
class PeriodSelector extends ConsumerWidget {
  const PeriodSelector({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final period = ref.watch(selectedPeriodProvider);

    return PopupMenuButton<String>(
      tooltip: 'Cambiar periodo académico',
      initialValue: period,
      onSelected: (value) =>
          ref.read(selectedPeriodProvider.notifier).state = value,
      itemBuilder: (_) => [
        for (final option in recentPeriods())
          PopupMenuItem(
            value: option,
            child: Row(
              children: [
                if (option == period)
                  Icon(Icons.check_outlined,
                      size: 18, color: Theme.of(context).colorScheme.primary)
                else
                  const SizedBox(width: 18),
                const SizedBox(width: 8),
                Text(option),
              ],
            ),
          ),
      ],
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(period, style: const TextStyle(fontWeight: FontWeight.w700)),
            const Icon(Icons.arrow_drop_down_outlined),
          ],
        ),
      ),
    );
  }
}
