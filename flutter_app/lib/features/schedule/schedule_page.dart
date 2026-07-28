import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/services/api_client.dart';
import '../../core/services/schedule_repository.dart';

final scheduleProvider = FutureProvider<List<Map<String, dynamic>>>((ref) async {
  return ScheduleRepository().list();
});

class SchedulePage extends ConsumerStatefulWidget {
  const SchedulePage({super.key});

  @override
  ConsumerState<SchedulePage> createState() => _SchedulePageState();
}

class _SchedulePageState extends ConsumerState<SchedulePage> {
  List<Map<String, dynamic>> _items = [];
  String _period = '2026-1';

  String _dayName(int day) {
    const days = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
    if (day < 1 || day > 7) return 'Día';
    return days[day - 1];
  }

  Future<void> _saveOrder() async {
    final payload = {
      'items': [
        for (var i = 0; i < _items.length; i++)
          {'id': _items[i]['_id'], 'order': i},
      ],
    };
    await ApiClient.instance.post('/schedules/reorder', data: payload);
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Horario ordenado')));
    }
    ref.invalidate(scheduleProvider);
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(scheduleProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Horario extendido'),
        actions: [
          DropdownButtonHideUnderline(
            child: DropdownButton<String>(
              value: _period,
              items: const [
                DropdownMenuItem(value: '2026-1', child: Text('2026-1')),
                DropdownMenuItem(value: '2026-2', child: Text('2026-2')),
              ],
              onChanged: (value) => setState(() {
                _period = value ?? '2026-1';
                _items = [];
              }),
            ),
          ),
          TextButton(onPressed: _saveOrder, child: const Text('Guardar orden')),
          const SizedBox(width: 12),
        ],
      ),
      body: async.when(
        data: (items) {
          if (_items.isEmpty) {
            _items = items.where((item) => item['period']?.toString() == _period || item['period'] == null).toList();
            _items.sort((a, b) {
              final ao = (a['order'] ?? 0) as int;
              final bo = (b['order'] ?? 0) as int;
              if (ao != bo) return ao.compareTo(bo);
              final ad = (a['dayOfWeek'] ?? 1) as int;
              final bd = (b['dayOfWeek'] ?? 1) as int;
              if (ad != bd) return ad.compareTo(bd);
              return (a['startTime'] ?? '').toString().compareTo((b['startTime'] ?? '').toString());
            });
          }
          return ReorderableListView.builder(
            padding: const EdgeInsets.all(16),
            itemCount: _items.length,
            // onReorderItem ya entrega el índice corregido tras retirar el
            // elemento, así que el ajuste manual de newIndex sobra.
            onReorderItem: (oldIndex, newIndex) {
              setState(() {
                final item = _items.removeAt(oldIndex);
                _items.insert(newIndex, item);
              });
            },
            itemBuilder: (_, i) {
              final item = _items[i];
              final subject = item['subjectId']?.toString() ?? '';
              return Card(
                key: ValueKey(item['_id'] ?? i),
                child: ListTile(
                  leading: const Icon(Icons.drag_handle),
                  title: Text('${_dayName((item['dayOfWeek'] ?? 1) as int)} ${item['startTime'] ?? ''} - ${item['endTime'] ?? ''}'),
                  subtitle: Text('${item['classroom'] ?? ''} • ${item['modality'] ?? ''} • ${item['durationMinutes'] ?? 90} min'),
                  trailing: Text(subject.length > 6 ? subject.substring(0, 6) : subject),
                ),
              );
            },
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Error: $e')),
      ),
    );
  }
}
