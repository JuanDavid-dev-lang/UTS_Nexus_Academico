import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/config.dart';
import '../../core/services/api_client.dart';
import '../../core/services/auth_controller.dart';
import '../../core/services/connection_settings.dart';
import '../../core/services/realtime_service.dart';

class SettingsPage extends ConsumerStatefulWidget {
  const SettingsPage({super.key});

  @override
  ConsumerState<SettingsPage> createState() => _SettingsPageState();
}

class _SettingsPageState extends ConsumerState<SettingsPage> {
  final apiUrl = TextEditingController();
  final wsUrl = TextEditingController();
  bool loading = true;
  bool saving = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final settings = await ConnectionSettings.load();
    apiUrl.text = settings.apiBaseUrl;
    wsUrl.text = settings.wsBaseUrl;
    if (mounted) setState(() => loading = false);
  }

  Future<void> _saveServer() async {
    setState(() => saving = true);
    final settings = ConnectionSettings(
      apiBaseUrl: AppConfig.normalizeApiBaseUrl(apiUrl.text),
      wsBaseUrl: AppConfig.normalizeWsBaseUrl(wsUrl.text),
    );
    await settings.save();
    ApiClient.instance.setBaseUrl(settings.apiBaseUrl);
    RealtimeService.instance.setBaseUrl(settings.wsBaseUrl);
    if (mounted) {
      setState(() => saving = false);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Servidor actualizado')),
      );
    }
  }

  @override
  void dispose() {
    apiUrl.dispose();
    wsUrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Configuraciones')),
      body: loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('Servidor', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
                        const SizedBox(height: 8),
                        TextField(
                          controller: apiUrl,
                          decoration: const InputDecoration(
                            labelText: 'API base URL',
                            hintText: 'http://192.168.1.20:4000',
                          ),
                        ),
                        const SizedBox(height: 12),
                        TextField(
                          controller: wsUrl,
                          decoration: const InputDecoration(
                            labelText: 'WS base URL',
                            hintText: 'http://192.168.1.20:4000',
                          ),
                        ),
                        const SizedBox(height: 12),
                        Align(
                          alignment: Alignment.centerRight,
                          child: FilledButton(
                            onPressed: saving ? null : _saveServer,
                            child: saving ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('Guardar'),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                SwitchListTile(
                  value: true,
                  onChanged: (_) {},
                  title: const Text('Modo oscuro'),
                ),
                SwitchListTile(
                  value: true,
                  onChanged: (_) {},
                  title: const Text('Notificaciones push'),
                ),
                SwitchListTile(
                  value: true,
                  onChanged: (_) {},
                  title: const Text('Sincronización automática'),
                ),
                const SizedBox(height: 16),
                FilledButton.icon(
                  onPressed: () async {
                    await ref.read(authControllerProvider.notifier).logout();
                    if (mounted) context.go('/login');
                  },
                  icon: const Icon(Icons.logout),
                  label: const Text('Cerrar sesión'),
                ),
              ],
            ),
    );
  }
}
