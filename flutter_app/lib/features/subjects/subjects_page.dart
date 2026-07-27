import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/services/api_client.dart';

final subjectsProvider = FutureProvider<List<Map<String, dynamic>>>((ref) async {
  final response = await ApiClient.instance.get('/subjects');
  final items = (response.data as Map)['items'] as List;
  return items.map((e) => Map<String, dynamic>.from(e as Map)).toList();
});

class SubjectsPage extends ConsumerWidget {
  const SubjectsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(subjectsProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Materias')),
      body: async.when(
        data: (items) => ListView.separated(
          padding: const EdgeInsets.all(16),
          itemCount: items.length,
          separatorBuilder: (_, __) => const Divider(height: 1),
          itemBuilder: (_, i) {
            final item = items[i];
            return ListTile(
              leading: const Icon(Icons.menu_book),
              title: Text(item['name']?.toString() ?? ''),
              subtitle: Text('${item['code'] ?? ''} • ${item['period'] ?? ''}'),
              trailing: Text('Créditos ${item['credits'] ?? 0}'),
            );
          },
        ),
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Error: $e')),
      ),
    );
  }
}

