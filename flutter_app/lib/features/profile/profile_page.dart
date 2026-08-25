import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/network/connection_controller.dart';
import '../../core/auth/auth_controller.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/session_menu.dart';
import '../../core/widgets/ui_kit.dart';
import './edit_profile_sheet.dart';

/// Perfil del usuario.
class ProfilePage extends ConsumerWidget {
  const ProfilePage({super.key});

  static String roleLabel(String? role) => switch (role) {
        'ADMIN' => 'Administrador',
        'COORDINATOR' => 'Coordinación',
        'SECRETARY' => 'Secretaría',
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
      appBar: AppBar(
        title: const Text('Perfil'),
        actions: [
          IconButton(
            tooltip: 'Editar perfil',
            icon: const Icon(Icons.edit_outlined),
            onPressed: () => showEditProfile(context),
          ),
        ],
      ),
      body: ListView(
        padding: AppSpacing.pagePadding,
        children: [
          Center(
            child: Column(
              children: [
                CircleAvatar(
                  radius: 42,
                  backgroundColor: primary.withValues(alpha: 0.12),
                  foregroundImage: user?.photoUrl != null
                      ? NetworkImage(user!.photoUrl!)
                      : null,
                  child: Text(
                    initialsOf(user?.fullName ?? 'U'),
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
            // El diálogo vive en `session_menu.dart`: el menú de la barra
            // superior ofrece la misma acción, y dos copias del aviso acaban
            // divergiendo justo en lo que importa —qué se borra exactamente—.
            onPressed: () => confirmLogout(context, ref),
            icon: const Icon(Icons.logout_outlined),
            label: const Text('Cerrar sesión'),
          ),
        ],
      ),
    );
  }
}
