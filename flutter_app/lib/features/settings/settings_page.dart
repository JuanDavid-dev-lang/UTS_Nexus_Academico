import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/network/connection_controller.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/theme_controller.dart';
import '../../core/widgets/session_menu.dart';
import '../../core/widgets/ui_kit.dart';
import './widgets/notifications_section.dart';
import './widgets/password_section.dart';
import './widgets/update_section.dart';
import '../../core/auth/auth_controller.dart';
import '../../core/admin/admin_mode_provider.dart';

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
      appBar: AppBar(
        title: const Text('Ajustes'),
        actions: const [SessionMenuButton()],
      ),
      body: ListView(
        padding: AppSpacing.pagePadding,
        children: [
          if (ref.watch(authControllerProvider).user?.role == 'ADMIN') ...[
            _SectionLabel('Modo de Interfaz Administrador', muted: muted),
            AppCard(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          color: ref.watch(adminModeProvider)
                              ? AppColors.primarySoft
                              : (isDark ? Colors.grey.shade800 : Colors.grey.shade200),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Icon(
                          Icons.admin_panel_settings_outlined,
                          color: ref.watch(adminModeProvider)
                              ? AppColors.primary
                              : muted,
                          size: 24,
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              ref.watch(adminModeProvider)
                                  ? 'Modo Administrador Activo'
                                  : 'Modo Normal (Admin)',
                              style: AppType.bodyStrong,
                            ),
                            Text(
                              ref.watch(adminModeProvider)
                                  ? 'Supervisión de docentes y cuentas activada.'
                                  : 'Vista simplificada de trabajo académico.',
                              style: AppType.caption.copyWith(color: muted),
                            ),
                          ],
                        ),
                      ),
                      Switch(
                        value: ref.watch(adminModeProvider),
                        onChanged: (val) =>
                            ref.read(adminModeProvider.notifier).set(val),
                      ),
                    ],
                  ),
                  if (ref.watch(adminModeProvider)) ...[
                    const Divider(height: 20),
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton.tonalIcon(
                        onPressed: () => context.push('/admin-supervision'),
                        icon: const Icon(Icons.travel_explore_outlined, size: 18),
                        label: const Text('Supervisión de Cuentas y Docentes'),
                      ),
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(height: 22),
          ],
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
                // `platformBrightnessOf` y no `MediaQuery.of`: solo interesa el
                // brillo del sistema, no cada cambio del MediaQueryData.
                final oscuroAhora = mode == ThemeMode.dark ||
                    (mode == ThemeMode.system &&
                        MediaQuery.platformBrightnessOf(context) ==
                            Brightness.dark);

                // Tres opciones y no un interruptor. Con el interruptor, tocar
                // el tema una sola vez dejaba la app clavada en claro u oscuro
                // para siempre: «seguir al sistema» era el estado inicial y no
                // había forma de volver a él, así que el teléfono que cambia
                // solo al anochecer dejaba de hacerlo sin explicación.
                return Padding(
                  padding: const EdgeInsets.fromLTRB(14, 10, 14, 14),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      ListTile(
                        contentPadding: EdgeInsets.zero,
                        leading: Icon(oscuroAhora
                            ? Icons.dark_mode_outlined
                            : Icons.light_mode_outlined),
                        title: const Text('Tema'),
                        subtitle: const Text('Verde profundo con lettering lima'),
                      ),
                      SegmentedButton<ThemeMode>(
                        segments: const [
                          ButtonSegment(
                            value: ThemeMode.light,
                            icon: Icon(Icons.light_mode_outlined),
                            label: Text('Claro'),
                          ),
                          ButtonSegment(
                            value: ThemeMode.dark,
                            icon: Icon(Icons.dark_mode_outlined),
                            label: Text('Oscuro'),
                          ),
                          ButtonSegment(
                            value: ThemeMode.system,
                            icon: Icon(Icons.brightness_auto_outlined),
                            label: Text('Sistema'),
                          ),
                        ],
                        selected: {mode},
                        showSelectedIcon: false,
                        onSelectionChanged: (seleccion) =>
                            ref.read(themeModeProvider.notifier).set(seleccion.first),
                      ),
                    ],
                  ),
                );
              },
            ),
          ),
          const SizedBox(height: 22),
          _SectionLabel('Ayuda', muted: muted),
          AppCard(
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
            child: ListTile(
              leading: const Icon(Icons.school_outlined),
              title: const Text('Ver el tutorial'),
              subtitle: const Text('Un recorrido por las secciones de la app'),
              trailing: const Icon(Icons.chevron_right_outlined),
              onTap: () => context.push('/tutorial'),
            ),
          ),
          const SizedBox(height: 22),
          _SectionLabel('Notificaciones', muted: muted),
          const NotificationsSection(),
          const SizedBox(height: 22),
          _SectionLabel('Actualizaciones', muted: muted),
          const UpdateSection(),
          const SizedBox(height: 22),
          _SectionLabel('Cuenta', muted: muted),
          const PasswordSection(),
          const SizedBox(height: 10),
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
