import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/network/connection_controller.dart';
import '../../core/services/auth_controller.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/ui_kit.dart';

/// Perfil del usuario.
class ProfilePage extends ConsumerWidget {
  const ProfilePage({super.key});

  static String roleLabel(String? role) => switch (role) {
        'ADMIN' => 'Administrador',
        'COORDINATOR' => 'Coordinación',
        'STUDENT' => 'Estudiante',
        _ => 'Docente',
      };

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authControllerProvider).user;
    final connection = ref.watch(connectionControllerProvider);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final muted = isDark ? AppColors.textMutedDark : AppColors.textMuted;
    final primary = Theme.of(context).colorScheme.primary;

    return Scaffold(
      appBar: AppBar(title: const Text('Perfil')),
      body: ListView(
        padding: AppSpacing.pagePadding,
        children: [
          Center(
            child: Column(
              children: [
                CircleAvatar(
                  radius: 42,
                  backgroundColor: primary.withValues(alpha: 0.12),
                  child: Text(
                    _initials(user?.fullName ?? 'U'),
                    style: AppType.h2.copyWith(
                      fontWeight: FontWeight.w800,
                      color: primary,
                    ),
                  ),
                ),
                const SizedBox(height: 14),
                Text(
                  user?.fullName ?? 'Sin sesión',
                  textAlign: TextAlign.center,
                  style: AppType.h3.copyWith(fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 4),
                Text(user?.email ?? '',
                    style: AppType.caption.copyWith(color: muted)),
                const SizedBox(height: 10),
                StatusPill(roleLabel(user?.role), kind: SemanticKind.brand),
              ],
            ),
          ),
          const SizedBox(height: 26),
          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'CONEXIÓN',
                  style: AppType.captionStrong.copyWith(
                    letterSpacing: 0.8,
                    fontWeight: FontWeight.w700,
                    color: muted,
                  ),
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    Icon(
                      connection.isUsable
                          ? Icons.check_circle_outline
                          : Icons.error_outline,
                      size: 18,
                      color: SemanticTone.of(
                        context,
                        connection.isUsable
                            ? SemanticKind.success
                            : SemanticKind.warning,
                      ).fg,
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        connection.baseUrl ?? 'Sin servidor',
                        style: AppType.caption
                            .copyWith(fontFamily: 'monospace'),
                      ),
                    ),
                  ],
                ),
                if (connection.detail != null) ...[
                  const SizedBox(height: 6),
                  Text(connection.detail!,
                      style: AppType.caption.copyWith(color: muted)),
                ],
              ],
            ),
          ),
          const SizedBox(height: 22),
          FilledButton.icon(
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.danger,
              foregroundColor: Colors.white,
            ),
            onPressed: () => _confirmLogout(context, ref),
            icon: const Icon(Icons.logout_outlined),
            label: const Text('Cerrar sesión'),
          ),
        ],
      ),
    );
  }

  /// Cerrar sesión borra las credenciales guardadas: merece confirmación.
  Future<void> _confirmLogout(BuildContext context, WidgetRef ref) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('¿Cerrar sesión?'),
        content: const Text(
          'Se borrarán tus credenciales guardadas en este dispositivo y '
          'tendrás que ingresar de nuevo.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: AppColors.danger),
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('Cerrar sesión'),
          ),
        ],
      ),
    );

    if (confirmed != true) return;
    await ref.read(authControllerProvider.notifier).logout();
    if (context.mounted) context.go('/login');
  }

  static String _initials(String name) {
    final parts =
        name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
    if (parts.isEmpty) return '?';
    if (parts.length == 1) return parts.first.substring(0, 1).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
}
