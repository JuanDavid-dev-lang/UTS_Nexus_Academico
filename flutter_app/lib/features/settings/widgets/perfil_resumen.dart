import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../core/auth/auth_user.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/session_menu.dart';
import '../../../core/widgets/ui_kit.dart';

/// Nombre legible de un rol para la ficha de Ajustes.
String etiquetaDeRol(String? rol) => switch (rol) {
  'ADMIN' => 'Administración',
  'COORDINATOR' => 'Coordinación',
  'SECRETARY' => 'Secretaría',
  'PROFESSOR' => 'Docente',
  'STUDENT' => 'Estudiante',
  _ => 'Cuenta',
};

/// Quién está dentro, arriba de Ajustes: avatar con el degradado de marca,
/// nombre, rol y correo, y un toque que lleva al perfil. Es lo primero que
/// se busca en Ajustes —«¿con qué cuenta estoy?»— y antes había que abrir el
/// menú del avatar para saberlo.
class PerfilResumen extends StatelessWidget {
  final AuthUser user;

  const PerfilResumen({super.key, required this.user});

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final tono = SemanticTone.of(context, SemanticKind.brand);

    return AppCard(
      onTap: () => context.push('/profile'),
      padding: const EdgeInsets.all(AppSpacing.gap),
      child: Row(
        children: [
          Container(
            width: 56,
            height: 56,
            padding: const EdgeInsets.all(2),
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              gradient: AppGradients.brand(palette),
              boxShadow: AppShadows.sm(palette.isDark),
            ),
            child: CircleAvatar(
              backgroundColor: palette.primary,
              foregroundImage: user.photoUrl != null
                  ? NetworkImage(user.photoUrl!)
                  : null,
              child: Text(
                initialsOf(user.fullName),
                style: AppType.bodyStrong.copyWith(
                  color: palette.onPrimary,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
          ),
          const SizedBox(width: AppSpacing.gap),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  user.fullName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppType.bodyStrong.copyWith(
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  user.email,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppType.caption.copyWith(color: palette.muted),
                ),
                const SizedBox(height: 6),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 2,
                  ),
                  decoration: BoxDecoration(
                    color: tono.bg,
                    borderRadius: BorderRadius.circular(AppSpacing.radiusPill),
                    border: Border.all(color: tono.border),
                  ),
                  child: Text(
                    etiquetaDeRol(user.role),
                    style: AppType.captionStrong.copyWith(color: tono.fg),
                  ),
                ),
              ],
            ),
          ),
          Icon(Icons.chevron_right_outlined, color: palette.muted),
        ],
      ),
    );
  }
}
