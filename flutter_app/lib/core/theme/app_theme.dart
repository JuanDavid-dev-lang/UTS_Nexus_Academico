import 'package:flutter/material.dart';

/// Sistema de diseño — UTS Nexus Académico (móvil).
///
/// Implementa los tokens de DESIGN.md: paleta institucional, colores
/// semánticos, espaciado y radios. Un color = un significado.
class AppColors {
  // Marca UTS (DESIGN.md §4): verde #144D37 dominante + lima #CAD225 acento.
  static const primary = Color(0xFF144D37); // Verde institucional
  static const secondary = Color(0xFFCAD225); // Lima (acento / lettering)
  static const lime = Color(0xFFCAD225);
  static const success = Color(0xFF16A34A); // Aprobado / riesgo bajo
  static const warning = Color(0xFFD97706); // Riesgo medio (ámbar, ≠ lima)
  static const danger = Color(0xFFDC2626); // Riesgo alto / error
  static const info = Color(0xFF0E7490); // Informativo

  // Neutros (claro)
  static const bg = Color(0xFFF4F7F1); // Fondo general (tinte verde suave)
  static const surface = Color(0xFFFFFFFF); // Cards
  static const surfaceAlt = Color(0xFFEAF0E6); // Cabeceras / chips
  static const border = Color(0xFFD8E2D4); // Bordes sutiles
  static const text = Color(0xFF12271E); // Texto principal (verdoso)
  static const textMuted = Color(0xFF5B6B61); // Texto secundario

  // Fondos suaves para badges
  static const successSoft = Color(0xFFDCFCE7);
  static const warningSoft = Color(0xFFFEF3C7);
  static const dangerSoft = Color(0xFFFEE2E2);
  static const infoSoft = Color(0xFFCFF4FA);
  static const accentSoft = Color(0xFFF1F6CE); // Lima suave

  // Ámbar oscuro para texto de riesgo medio (contraste AA)
  static const warningText = Color(0xFFB45309);

  // Neutros para modo oscuro (verde profundo + lima)
  static const bgDark = Color(0xFF0F3D2B);
  static const surfaceDark = Color(0xFF164D38);
  static const surfaceAltDark = Color(0xFF1E5B44);
  static const borderDark = Color(0xFF2E6B51);
  static const textDark = Color(0xFFE9F2D3); // Lima muy claro (letra)
  static const textMutedDark = Color(0xFF9FB89F);
}

/// Espaciado y radios (DESIGN.md §7).
class AppSpacing {
  static const double page = 24;
  static const double gap = 16;
  static const double radiusCard = 18;
  static const double radiusInput = 12;
  static const double radiusPill = 999;
}

/// Devuelve (color de texto, fondo suave, emoji, etiqueta) para un nivel de
/// riesgo. DESIGN.md §12: siempre color + significado, nunca solo color.
class RiskStyle {
  final Color color;
  final Color background;
  final String emoji;
  final String label;
  const RiskStyle(this.color, this.background, this.emoji, this.label);

  static RiskStyle of(String nivel) {
    switch (nivel.toUpperCase()) {
      case 'ALTO':
      case 'HIGH':
        return const RiskStyle(
            AppColors.danger, AppColors.dangerSoft, '🔴', 'Riesgo Alto');
      case 'MEDIO':
      case 'MEDIUM':
        return const RiskStyle(
            AppColors.warningText, AppColors.warningSoft, '🟡', 'Riesgo Medio');
      default:
        return const RiskStyle(
            AppColors.success, AppColors.successSoft, '🟢', 'Sin riesgo');
    }
  }
}

class AppTheme {
  static ThemeData get light {
    final scheme = ColorScheme.fromSeed(
      seedColor: AppColors.primary,
      brightness: Brightness.light,
    ).copyWith(
      primary: AppColors.primary,
      onPrimary: Colors.white,
      secondary: AppColors.secondary,
      error: AppColors.danger,
      surface: AppColors.surface,
    );
    return _base(scheme, AppColors.bg, AppColors.surface, AppColors.border,
        AppColors.text);
  }

  static ThemeData get dark {
    final scheme = ColorScheme.fromSeed(
      seedColor: AppColors.primary,
      brightness: Brightness.dark,
    ).copyWith(
      primary: AppColors.lime, // La lima es el acento principal en oscuro
      onPrimary: AppColors.bgDark, // Texto verde oscuro sobre lima
      secondary: AppColors.lime,
      error: AppColors.danger,
      surface: AppColors.surfaceDark,
    );
    return _base(scheme, AppColors.bgDark, AppColors.surfaceDark,
        AppColors.borderDark, AppColors.textDark);
  }

  static ThemeData _base(ColorScheme scheme, Color bg, Color surface,
      Color border, Color text) {
    return ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      scaffoldBackgroundColor: bg,
      appBarTheme: AppBarTheme(
        backgroundColor: surface,
        foregroundColor: text,
        elevation: 0,
        centerTitle: false,
        scrolledUnderElevation: 0.5,
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: surface,
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppSpacing.radiusInput),
          borderSide: BorderSide(color: border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppSpacing.radiusInput),
          borderSide: BorderSide(color: border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppSpacing.radiusInput),
          borderSide: BorderSide(color: scheme.primary, width: 1.6),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: scheme.primary,
          foregroundColor: scheme.onPrimary,
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppSpacing.radiusInput),
          ),
          textStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
        ),
      ),
      navigationRailTheme: NavigationRailThemeData(
        backgroundColor: surface,
        indicatorColor: scheme.primary.withValues(alpha: 0.16),
        selectedIconTheme: IconThemeData(color: scheme.primary),
        selectedLabelTextStyle:
            TextStyle(color: scheme.primary, fontWeight: FontWeight.w600),
        unselectedIconTheme: IconThemeData(color: text.withValues(alpha: 0.7)),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: surface,
        indicatorColor: scheme.primary.withValues(alpha: 0.16),
        elevation: 1,
      ),
      dividerTheme: DividerThemeData(color: border, thickness: 1),
    );
  }
}
