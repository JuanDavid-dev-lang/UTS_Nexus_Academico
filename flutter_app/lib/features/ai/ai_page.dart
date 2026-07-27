import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/services/api_client.dart';

class AiPage extends ConsumerStatefulWidget {
  const AiPage({super.key});

  @override
  ConsumerState<AiPage> createState() => _AiPageState();
}

class _AiPageState extends ConsumerState<AiPage> {
  final controller = TextEditingController(text: '¿Cuánto necesita Juan para aprobar?');
  String answer = '';
  bool loading = false;

  Future<void> send() async {
    setState(() => loading = true);
    try {
      final response = await ApiClient.instance.post('/ai/chat', data: {'message': controller.text});
      final data = Map<String, dynamic>.from(response.data as Map);
      setState(() => answer = data['answer']?.toString() ?? '');
    } finally {
      setState(() => loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Asistente IA')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            TextField(
              controller: controller,
              maxLines: 3,
              decoration: const InputDecoration(
                labelText: 'Consulta académica',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            FilledButton(
              onPressed: loading ? null : send,
              child: loading ? const CircularProgressIndicator() : const Text('Consultar'),
            ),
            const SizedBox(height: 20),
            if (answer.isNotEmpty)
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Text(answer),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

