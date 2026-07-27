import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/config.dart';
import '../../core/services/backend_bootstrap.dart';
import '../../core/services/api_client.dart';
import '../../core/services/auth_controller.dart';
import '../../core/services/connection_settings.dart';
import '../../core/services/realtime_service.dart';

class LoginPage extends ConsumerStatefulWidget {
  const LoginPage({super.key});

  @override
  ConsumerState<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends ConsumerState<LoginPage> {
  final email = TextEditingController(text: 'docente@uts.edu.co');
  final password = TextEditingController(text: 'Uts12345!');
  final apiUrl = TextEditingController();
  final wsUrl = TextEditingController();

  String? error;
  bool loadingConfig = true;
  bool savingServer = false;

  @override
  void initState() {
    super.initState();
    _loadConfig();
  }

  Future<void> _loadConfig() async {
    final settings = await ConnectionSettings.load();
    apiUrl.text = settings.apiBaseUrl;
    wsUrl.text = settings.wsBaseUrl;
    if (mounted) setState(() => loadingConfig = false);
  }

  Future<void> _saveServer() async {
    setState(() {
      savingServer = true;
      error = null;
    });
    final settings = ConnectionSettings(
      apiBaseUrl: AppConfig.normalizeApiBaseUrl(apiUrl.text),
      wsBaseUrl: AppConfig.normalizeWsBaseUrl(wsUrl.text),
    );
    await settings.save();
    ApiClient.instance.setBaseUrl(settings.apiBaseUrl);
    RealtimeService.instance.setBaseUrl(settings.wsBaseUrl);
    if (mounted) {
      setState(() => savingServer = false);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Servidor guardado')),
      );
    }
  }

  String _friendlyError(Object err) {
    if (err is DioException) {
      final status = err.response?.statusCode;
      final message = err.response?.data?.toString();
      if (status != null) {
        return 'HTTP $status${message == null ? '' : ': $message'}';
      }
      return err.message ?? 'Sin conexión al backend';
    }
    return err.toString();
  }

  @override
  void dispose() {
    email.dispose();
    password.dispose();
    apiUrl.dispose();
    wsUrl.dispose();
    super.dispose();
  }

  Widget _serverFields() {
    return ExpansionTile(
      iconColor: Colors.white70,
      collapsedIconColor: Colors.white70,
      title: const Text('Servidor', style: TextStyle(color: Colors.white)),
      subtitle: const Text(
        'Ajusta la API si usas un móvil físico',
        style: TextStyle(color: Colors.white54),
      ),
      children: [
        const SizedBox(height: 8),
        TextField(
          controller: apiUrl,
          style: const TextStyle(color: Colors.white),
          decoration: const InputDecoration(
            labelText: 'API base URL',
            hintText: 'http://192.168.1.20:4000',
            labelStyle: TextStyle(color: Colors.white70),
          ),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: wsUrl,
          style: const TextStyle(color: Colors.white),
          decoration: const InputDecoration(
            labelText: 'WS base URL',
            hintText: 'http://192.168.1.20:4000',
            labelStyle: TextStyle(color: Colors.white70),
          ),
        ),
        const SizedBox(height: 12),
        Align(
          alignment: Alignment.centerRight,
          child: OutlinedButton(
            onPressed: savingServer ? null : _saveServer,
            child: savingServer
                ? const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Text('Guardar servidor'),
          ),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authControllerProvider);
    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xFF00305F), Color(0xFF0057B8), Color(0xFF0099FF)],
          ),
        ),
        child: SafeArea(
          child: LayoutBuilder(
            builder: (context, constraints) {
              return SingleChildScrollView(
                padding: const EdgeInsets.all(24),
                child: ConstrainedBox(
                  constraints: BoxConstraints(minHeight: constraints.maxHeight - 48),
                  child: Center(
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 520),
                      child: Card(
                        elevation: 14,
                        color: const Color(0xFF0E223F),
                        margin: EdgeInsets.zero,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
                        child: Padding(
                          padding: const EdgeInsets.all(28),
                          child: loadingConfig
                              ? const SizedBox(
                                  height: 260,
                                  child: Center(child: CircularProgressIndicator()),
                                )
                              : Column(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    const Icon(Icons.school, size: 60, color: Colors.white),
                                    const SizedBox(height: 12),
                                    Text(
                                      'UTS Nexus Académico',
                                      textAlign: TextAlign.center,
                                      style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                                          color: Colors.white, fontWeight: FontWeight.w800),
                                    ),
                                    const SizedBox(height: 4),
                                    Text(
                                      'Acceso docente',
                                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: Colors.white70),
                                    ),
                                    const SizedBox(height: 20),
                                    TextField(
                                      controller: email,
                                      style: const TextStyle(color: Colors.white),
                                      decoration: const InputDecoration(
                                        labelText: 'Correo',
                                        labelStyle: TextStyle(color: Colors.white70),
                                      ),
                                    ),
                                    const SizedBox(height: 12),
                                    TextField(
                                      controller: password,
                                      obscureText: true,
                                      style: const TextStyle(color: Colors.white),
                                      decoration: const InputDecoration(
                                        labelText: 'Contraseña',
                                        labelStyle: TextStyle(color: Colors.white70),
                                      ),
                                    ),
                                    const SizedBox(height: 14),
                                    _serverFields(),
                                    const SizedBox(height: 8),
                                    if (error != null) ...[
                                      Text(error!, style: const TextStyle(color: Colors.redAccent)),
                                      const SizedBox(height: 8),
                                    ],
                                    FilledButton(
                                      onPressed: auth.loading
                                          ? null
                                          : () async {
                                              try {
                                        final settings = ConnectionSettings(
                                                  apiBaseUrl: AppConfig.normalizeApiBaseUrl(apiUrl.text),
                                                  wsBaseUrl: AppConfig.normalizeWsBaseUrl(wsUrl.text),
                                                );
                                                await settings.save();
                                                await BackendBootstrap.ensureRunning();
                                                ApiClient.instance.setBaseUrl(settings.apiBaseUrl);
                                                RealtimeService.instance.setBaseUrl(settings.wsBaseUrl);
                                                await ref
                                                    .read(authControllerProvider.notifier)
                                                    .login(email.text.trim(), password.text.trim());
                                                if (mounted) context.go('/');
                                              } catch (err) {
                                                setState(() => error = _friendlyError(err));
                                              }
                                            },
                                      child: auth.loading
                                          ? const SizedBox(
                                              width: 18,
                                              height: 18,
                                              child: CircularProgressIndicator(strokeWidth: 2),
                                            )
                                          : const Text('Entrar'),
                                    ),
                                    TextButton(
                                      onPressed: () => context.go('/recovery'),
                                      child: const Text('¿Olvidaste tu contraseña?'),
                                    ),
                                  ],
                                ),
                        ),
                      ),
                    ),
                  ),
                ),
              );
            },
          ),
        ),
      ),
    );
  }
}
