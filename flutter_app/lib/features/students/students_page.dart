import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/services/api_client.dart';

final studentsProvider = FutureProvider<List<Map<String, dynamic>>>((ref) async {
  final response = await ApiClient.instance.get('/students');
  final items = (response.data as Map)['items'] as List;
  return items.map((e) => Map<String, dynamic>.from(e as Map)).toList();
});

class StudentsPage extends ConsumerWidget {
  const StudentsPage({super.key});

  Future<void> _showImportDialog(BuildContext context, WidgetRef ref) async {
    final controller = TextEditingController();
    await showDialog(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Importar estudiantes'),
        content: SizedBox(
          width: 520,
          child: TextField(
            controller: controller,
            minLines: 10,
            maxLines: 20,
            decoration: const InputDecoration(
              hintText: 'cedula,nombres,correo,programa\n1001,Juan Perez,juan@uts.edu.co,Sistemas',
            ),
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cerrar')),
          FilledButton(
            onPressed: () async {
              final lines = controller.text.split('\n').where((line) => line.trim().isNotEmpty).toList();
              if (lines.length <= 1) return;
              final rows = <Map<String, dynamic>>[];
              for (var i = 1; i < lines.length; i++) {
                final cols = lines[i].split(',');
                if (cols.length < 4) continue;
                rows.add({
                  'code': cols[0].trim(),
                  'fullName': cols[1].trim(),
                  'email': cols[2].trim(),
                  'program': cols[3].trim(),
                });
              }
              if (rows.isNotEmpty) {
                await ApiClient.instance.post('/students/bulk', data: rows);
              }
              if (context.mounted) Navigator.pop(context);
              ref.invalidate(studentsProvider);
            },
            child: const Text('Importar'),
          ),
        ],
      ),
    );
    controller.dispose();
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(studentsProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Estudiantes'),
        actions: [
          TextButton(onPressed: () => _showImportDialog(context, ref), child: const Text('Importar')),
        ],
      ),
      body: async.when(
        data: (items) => ListView.separated(
          padding: const EdgeInsets.all(16),
          itemCount: items.length,
          separatorBuilder: (_, __) => const Divider(height: 1),
          itemBuilder: (_, i) {
            final item = items[i];
            final name = (item['fullName'] ?? 'E').toString();
            return ListTile(
              leading: CircleAvatar(child: Text(name.isEmpty ? 'E' : name[0])),
              title: Text(name),
              subtitle: Text('${item['code'] ?? ''} • ${item['program'] ?? ''}'),
              trailing: Text('${(item['attendanceRate'] ?? 0).toString()}%'),
            );
          },
        ),
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Error: $e')),
      ),
    );
  }
}
