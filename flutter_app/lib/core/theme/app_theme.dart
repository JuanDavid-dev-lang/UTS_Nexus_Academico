import 'package:flutter/material.dart';

/// Sistema de diseño — UTS Nexus Académico (móvil).
///
/// Implementa los tokens de DESIGN.md: paleta institucional, colores
/// semánticos, espaciado y radios. Un color = un significado.
class AppColors {
  // Paleta principal (DESIGN.md §4)
  static const primary = Color(0xFF0057B8); // Azul institucional
  static const secondary = Color(0xFF0099FF); // Azul claro
  static const success = Color(0xFF22C55E); // Aprobado / riesgo bajo
  static const warning = Color(0xFFFACC15); // Riesgo medio
  static const danger = Color(0xFFEF4444); // Riesgo alto / error
  static const info = Color(0xFF3B82F6); // Informativo

  // Neutros
  static const bg = Color(0xFFF8FAFC); // Fondo general
  static const surface = Color(0xFFFFFFFF); // Cards
  static const surfaceAlt = Color(0xFFF1F5F9); // Cabeceras / chips
  static const border = Color(0xFFE2E8F0); // Bordes sutiles
  static const text = Color(0xFF111827); // Texto principal
  static const textMuted = Color(0xFF6B7280); // Texto secundario

  // Fondos suaves para badges
  static const successSoft = Color(0xFFDCFCE7);
  static const warningSoft = Color(0xFFFEF9C3);
  static const dangerSoft = Color(0xFFFEE2E2);
  static const infoSoft = Color(0xFFDBEAFE);

  // Ámbar oscuro para texto de riesgo medio (contraste AA)
  static const warningText = Color(0xFFB45309);

  // Neutros para modo oscuro
  static const bgDark = Color(0xFF0F172A);
  static const surfaceDark = Color(0xFF1E293B);
  static const borderDark = Color(0xFF334155);
  static const textDark = Color(0xFFF1F5F9);
  static const textMutedDark = Color(0xFF94A3B8);
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
      primary: AppColors.secondary,
      secondary: AppColors.primary,
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
          borderSide: const BorderSide(color: AppColors.primary, width: 1.6),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: AppColors.primary,
          foregroundColor: Colors.white,
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppSpacing.radiusInput),
          ),
          textStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
        ),
      ),
      navigationRailTheme: NavigationRailThemeData(
        backgroundColor: surface,
        indicatorColor: AppColors.primary.withValues(alpha: 0.12),
        selectedIconTheme: const IconThemeData(color: AppColors.primary),
        selectedLabelTextStyle: const TextStyle(
            color: AppColors.primary, fontWeight: FontWeight.w600),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: surface,
        indicatorColor: AppColors.primary.withValues(alpha: 0.12),
        elevation: 1,
      ),
      dividerTheme: DividerThemeData(color: border, thickness: 1),
    );
  }
}
