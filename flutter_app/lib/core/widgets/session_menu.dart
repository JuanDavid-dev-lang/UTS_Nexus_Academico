import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../auth/auth_controller.dart';
import '../theme/app_theme.dart';

/// Acceso a la sesión desde la barra superior de cualquier pantalla.
///
/// Cerrar sesión vivía solo dentro de Perfil, y a Perfil no se llegaba desde
/// ninguna pestaña: había que entrar a Ajustes y bajar hasta una fila llamada
/// "Datos de la sesión". Tres toques y un nombre que no dice "salir". Aquí el
/// avatar hace de ancla —quién soy y cómo salgo, en el mismo sitio— que es
/// donde lo busca cualquiera que haya usado otra aplicación.
class SessionMenuButton extends ConsumerWidget {
  const SessionMenuButton({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authControllerProvider).user;
    if (user == null) return const SizedBox.shrink();

    final scheme = Theme.of(context).colorScheme;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    // El rojo canónico está calibrado para texto sobre blanco; sobre la
    // superficie oscura del menú se queda por debajo del AA que exige DESIGN.md.
    final danger = isDark ? AppColors.dangerDark : AppColors.danger;

    return PopupMenuButton<String>(
      tooltip: 'Sesión',
      offset: const Offset(0, 48),
      onSelected: (value) async {
        switch (value) {
          case 'profile':
            context.go('/profile');
          case 'settings':
            context.go('/settings');
          case 'logout':
            await confirmLogout(context, ref);
        }
      },
      itemBuilder: (menuContext) => [
        PopupMenuItem(
          enabled: false,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(user.fullName, style: AppType.bodyStrong),
              Text(
                user.email,
                style: AppType.caption.copyWith(
                  color: isDark ? AppColors.textMutedDark : AppColors.textMuted,
                ),
              ),
            ],
          ),
        ),
        const PopupMenuDivider(),
        const PopupMenuItem(
          value: 'profile',
          child: ListTile(
            dense: true,
            contentPadding: EdgeInsets.zero,
            leading: Icon(Icons.person_outline),
            title: Text('Mi perfil'),
          ),
        ),
        const PopupMenuItem(
          value: 'settings',
          child: ListTile(
            dense: true,
            contentPadding: EdgeInsets.zero,
            leading: Icon(Icons.settings_outlined),
            title: Text('Ajustes'),
          ),
        ),
        const PopupMenuDivider(),
        PopupMenuItem(
          value: 'logout',
          child: ListTile(
            dense: true,
            contentPadding: EdgeInsets.zero,
            leading: Icon(Icons.logout_outlined, color: danger),
            title: Text('Cerrar sesión', style: TextStyle(color: danger)),
          ),
        ),
      ],
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12),
        child: CircleAvatar(
          radius: 16,
          backgroundColor: scheme.primary,
          foregroundImage:
              user.photoUrl != null ? NetworkImage(user.photoUrl!) : null,
          child: Text(
            initialsOf(user.fullName),
            style: AppType.captionStrong.copyWith(color: scheme.onPrimary),
          ),
        ),
      ),
    );
  }
}

/// Iniciales para el avatar. Dos como mucho: con tres ya no se leen a 32 px.
String initialsOf(String name) {
  final parts =
      name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
  if (parts.isEmpty) return '?';
  if (parts.length == 1) return parts.first.substring(0, 1).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/// Confirmación de cierre de sesión.
///
/// Vive fuera del widget porque la usan el menú y la pantalla de perfil, y dos
/// copias del mismo aviso acaban divergiendo justo en lo que importa: qué se
/// borra exactamente.
Future<void> confirmLogout(BuildContext context, WidgetRef ref) async {
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
