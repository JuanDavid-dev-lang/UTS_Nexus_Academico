import 'package:flutter/material.dart';
import '../../core/services/api_client.dart';

class RecoveryPage extends StatefulWidget {
  const RecoveryPage({super.key});

  @override
  State<RecoveryPage> createState() => _RecoveryPageState();
}

class _RecoveryPageState extends State<RecoveryPage> {
  final email = TextEditingController();
  final code = TextEditingController();
  final password = TextEditingController();
  String message = '';
  bool requesting = true;

  Future<void> requestCode() async {
    final response = await ApiClient.instance.post('/auth/recovery/request', data: {'email': email.text.trim()});
    setState(() => message = response.data.toString());
  }

  Future<void> resetPassword() async {
    final response = await ApiClient.instance.post('/auth/recovery/reset', data: {
      'email': email.text.trim(),
      'code': code.text.trim(),
      'newPassword': password.text.trim(),
    });
    setState(() => message = response.data.toString());
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Recuperación')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            TextField(controller: email, decoration: const InputDecoration(labelText: 'Correo')),
            const SizedBox(height: 12),
            TextField(controller: code, decoration: const InputDecoration(labelText: 'Código')),
            const SizedBox(height: 12),
            TextField(controller: password, obscureText: true, decoration: const InputDecoration(labelText: 'Nueva contraseña')),
            const SizedBox(height: 16),
            Wrap(
              spacing: 12,
              children: [
                FilledButton(onPressed: requestCode, child: const Text('Solicitar código')),
                FilledButton(onPressed: resetPassword, child: const Text('Restablecer')),
              ],
            ),
            const SizedBox(height: 16),
            Text(message),
          ],
        ),
      ),
    );
  }
}

