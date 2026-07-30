import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/network/connection_controller.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/theme_controller.dart';
import '../../core/widgets/ui_kit.dart';

/// Ajustes.
///
/// Se eliminaron dos interruptores —"Notificaciones push" y "Sincronización
/// automática"— que tenían `value: true` fijo y un `onChanged` vacío: parecían
/// funcionar y no hacían nada. Un control que miente sobre el estado del sistema
/// es peor que no tenerlo.
///
/// La dirección del servidor tampoco se pide ya: la app la descubre sola. Queda
/// como entrada manual plegada, para redes donde el barrido no llega.
class SettingsPage extends ConsumerStatefulWidget {
  const SettingsPage({super.key});

  @override
  ConsumerState<SettingsPage> createState() => _SettingsPageState();
}

class _SettingsPageState extends ConsumerState<SettingsPage> {
  final _manualServer = TextEditingController();
  bool _showManual = false;
  bool _working = false;

  @override
  void dispose() {
    _manualServer.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final connection = ref.watch(connectionControllerProvider);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final muted = isDark ? AppColors.textMutedDark : AppColors.textMuted;

    return Scaffold(
      appBar: AppBar(title: const Text('Ajustes')),
      body: ListView(
        padding: AppSpacing.pagePadding,
        children: [
          _SectionLabel('Servidor', muted: muted),
          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Icon(
                      switch (connection.phase) {
                        ConnectionPhase.connected => Icons.check_circle_outline,
                        ConnectionPhase.degraded =>
                          Icons.warning_amber_outlined,
                        ConnectionPhase.discovering =>
                          Icons.travel_explore_outlined,
                        ConnectionPhase.checking => Icons.wifi_find_outlined,
                        ConnectionPhase.notFound => Icons.wifi_off_outlined,
                      },
                      size: 20,
                      color: switch (connection.phase) {
                        ConnectionPhase.connected =>
                          SemanticTone.of(context, SemanticKind.success).fg,
                        ConnectionPhase.degraded =>
                          SemanticTone.of(context, SemanticKind.warning).fg,
                        ConnectionPhase.notFound =>
                          SemanticTone.of(context, SemanticKind.danger).fg,
                        _ => muted,
                      },
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            connection.baseUrl ?? 'Sin servidor',
                            style: AppType.caption
                                .copyWith(fontFamily: 'monospace'),
                          ),
                          if (connection.detail != null)
                            Text(connection.detail!,
                                style:
                                    AppType.caption.copyWith(color: muted)),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 14),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: _working ? null : _rediscover,
                        icon: _working
                            ? const SizedBox(
                                height: 15,
                                width: 15,
                                child:
                                    CircularProgressIndicator(strokeWidth: 2))
                            : const Icon(Icons.refresh, size: 18),
                        label: const Text('Buscar servidor'),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: TextButton(
                        onPressed: () =>
                            setState(() => _showManual = !_showManual),
                        child: Text(_showManual ? 'Ocultar' : 'Manual'),
                      ),
                    ),
                  ],
                ),
                if (_showManual) ...[
                  const SizedBox(height: 12),
                  TextField(
                    controller: _manualServer,
                    keyboardType: TextInputType.url,
                    autocorrect: false,
                    decoration: const InputDecoration(
                      labelText: 'Dirección del servidor',
                      hintText: '192.168.1.10',
                      isDense: true,
                    ),
                  ),
                  const SizedBox(height: 10),
                  FilledButton(
                    onPressed: _applyManual,
                    child: const Text('Conectar'),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: 22),
          _SectionLabel('Apariencia', muted: muted),
          AppCard(
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
            child: Builder(
              builder: (context) {
                final mode = ref.watch(themeModeProvider);
                final dark = mode == ThemeMode.dark ||
                    (mode == ThemeMode.system &&
                        MediaQuery.platformBrightnessOf(context) ==
                            Brightness.dark);
                return SwitchListTile(
                  value: dark,
                  onChanged: (value) =>
                      ref.read(themeModeProvider.notifier).toggleDark(value),
                  title: const Text('Modo oscuro'),
                  subtitle: const Text('Verde profundo con lettering lima'),
                  secondary: Icon(dark
                      ? Icons.dark_mode_outlined
                      : Icons.light_mode_outlined),
                );
              },
            ),
          ),
          const SizedBox(height: 22),
          _SectionLabel('Cuenta', muted: muted),
          AppCard(
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
            child: ListTile(
              leading: const Icon(Icons.person_outline),
              title: const Text('Mi perfil'),
              subtitle: const Text('Datos de la sesión y cerrar sesión'),
              trailing: const Icon(Icons.chevron_right_outlined),
              onTap: () => context.go('/profile'),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _rediscover() async {
    setState(() => _working = true);
    await ref.read(connectionControllerProvider.notifier).discover();
    if (mounted) setState(() => _working = false);
  }

  Future<void> _applyManual() async {
    final ok = await ref
        .read(connectionControllerProvider.notifier)
        .setManual(_manualServer.text);
    if (!mounted) return;
    if (ok) {
      setState(() => _showManual = false);
      AppToast.success(context, 'Servidor conectado');
    } else {
      AppToast.error(context, 'No responde',
          'Verifica la dirección y que el servidor esté encendido.');
    }
  }
}

class _SectionLabel extends StatelessWidget {
  final String text;
  final Color muted;
  const _SectionLabel(this.text, {required this.muted});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(left: 4, bottom: 8),
      child: Text(
        text.toUpperCase(),
        style: AppType.captionStrong.copyWith(
          letterSpacing: 0.8,
          fontWeight: FontWeight.w700,
          color: muted,
        ),
      ),
    );
  }
}
