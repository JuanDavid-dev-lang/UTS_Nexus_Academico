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

  // Ámbar oscuro para texto de riesgo medio (contraste AA sobre fondo claro)
  static const warningText = Color(0xFFB45309);

  // Acento secundario (DESIGN.md §4): hover de botones secundarios, iconos
  // relevantes pero inactivos, barras de progreso secundarias.
  static const accentSecondary = Color(0xFF999E3C);

  // ── Modo oscuro — escala oliva (DESIGN.md §4) ──────────────────────────
  // El modo oscuro anterior pintaba las superficies con el verde institucional
  // y el texto en lima: las capas no se distinguían entre sí y los bloques de
  // texto competían con los botones. Ahora las superficies son oliva neutro y
  // la lima queda reservada a la interacción.
  //
  // La elevación la marca el contraste tonal, nunca el acento:
  // bgDark → surfaceDark → surfaceAltDark → borderDark.
  static const bgDark = Color(0xFF232922); // Fondo base
  static const surfaceDark = Color(0xFF33332A); // Cards / paneles (elevación 1)
  static const surfaceAltDark = Color(0xFF37382C); // Flotantes (elevación 2)
  // DESIGN.md admite el tono de borde al 25–35% en divisores sutiles; este es
  // #696B3E resuelto al 30% sobre la superficie de card.
  static const borderDark = Color(0xFF43442F);
  static const borderStrongDark = Color(0xFF696B3E);
  static const textDark = Color(0xFFEDEFDD); // Crema-lima, no lima puro
  static const textMutedDark = Color(0xFFA6AA8A);

  // Semánticos en oscuro. Los hex canónicos de §4 están calibrados para texto
  // sobre blanco: sobre #33332A caen a 2.4–4.0:1, por debajo del mínimo AA que
  // exigen la regla 5 de §4 y §15. Se aclaran para conservar el significado
  // (verde = éxito, rojo = peligro) cumpliendo contraste.
  static const successDark = Color(0xFF4ADE80);
  static const warningDark = Color(0xFFFBBF24);
  static const dangerDark = Color(0xFFF87171);
  static const infoDark = Color(0xFF38BDF8);

  // Fondos suaves para badges en oscuro (contrapartida de los chips claros).
  static const successSoftDark = Color(0xFF1C3B23);
  static const warningSoftDark = Color(0xFF40320F);
  static const dangerSoftDark = Color(0xFF43201D);
  static const infoSoftDark = Color(0xFF123A44);
  static const accentSoftDark = Color(0xFF3A3D1C);
}

/// Estado semántico: éxito, advertencia, peligro, información.
///
/// Existe para que una pantalla no tenga que elegir a mano el par
/// (color de texto, fondo suave) según el tema. Los chips claros de §4 sobre
/// las superficies oliva no llegan a AA, así que cada tono tiene su versión
/// oscura y se resuelve aquí, en un solo sitio.
/// `brand` no es un estado: es énfasis de marca (etiqueta de rol, chip de
/// identidad). Vive aquí para que esos realces se resuelvan por tema igual que
/// los demás, en vez de fijar el verde institucional que el modo oscuro no lee.
enum SemanticKind { success, warning, danger, info, brand }

/// Par resuelto (color de texto/icono, fondo suave) para un estado semántico.
class SemanticTone {
  final Color fg;
  final Color bg;
  const SemanticTone(this.fg, this.bg);

  static SemanticTone resolve(SemanticKind kind, bool isDark) {
    switch (kind) {
      case SemanticKind.success:
        return isDark
            ? const SemanticTone(
                AppColors.successDark, AppColors.successSoftDark)
            : const SemanticTone(AppColors.success, AppColors.successSoft);
      case SemanticKind.warning:
        return isDark
            ? const SemanticTone(
                AppColors.warningDark, AppColors.warningSoftDark)
            // En claro el ámbar de marca no llega a AA como texto: se usa el
            // ámbar oscuro para la letra y el de marca queda para indicadores.
            : const SemanticTone(AppColors.warningText, AppColors.warningSoft);
      case SemanticKind.danger:
        return isDark
            ? const SemanticTone(AppColors.dangerDark, AppColors.dangerSoftDark)
            : const SemanticTone(AppColors.danger, AppColors.dangerSoft);
      case SemanticKind.info:
        return isDark
            ? const SemanticTone(AppColors.infoDark, AppColors.infoSoftDark)
            : const SemanticTone(AppColors.info, AppColors.infoSoft);
      case SemanticKind.brand:
        // El verde institucional desaparece sobre las superficies oliva; en
        // oscuro la marca la lleva la lima, que §4 admite en badges pequeños.
        return isDark
            ? const SemanticTone(AppColors.lime, AppColors.accentSoftDark)
            : const SemanticTone(AppColors.primary, AppColors.accentSoft);
    }
  }

  /// Resuelve contra el tema activo.
  static SemanticTone of(BuildContext context, SemanticKind kind) =>
      resolve(kind, Theme.of(context).brightness == Brightness.dark);
}

/// Espaciado y radios (DESIGN.md §7).
class AppSpacing {
  static const double page = 24;
  static const double gap = 16;
  static const double radiusCard = 18;
  static const double radiusInput = 12;
  static const double radiusPill = 999;

  /// Relleno estándar de página: 24 a los lados, más aire al final para que la
  /// última tarjeta no quede pegada a la barra de navegación.
  static const EdgeInsets pagePadding =
      EdgeInsets.fromLTRB(page, page, page, page + gap);
}

/// Escala tipográfica (DESIGN.md §5): cinco pasos, uno por rol.
///
/// Antes cada pantalla elegía su tamaño a mano y convivían dieciocho valores
/// distintos, varios con medio punto. Un tamaño fuera de esta escala es un
/// error, no una variante.
class AppType {
  /// Título de página.
  static const h1 = TextStyle(fontSize: 36, fontWeight: FontWeight.w800);

  /// Sección principal.
  static const h2 = TextStyle(fontSize: 30, fontWeight: FontWeight.w700);

  /// Subsección o título de tarjeta.
  static const h3 = TextStyle(fontSize: 24, fontWeight: FontWeight.w700);

  /// Texto general.
  static const body = TextStyle(fontSize: 16, fontWeight: FontWeight.w400);

  /// Texto general con énfasis (etiquetas de botón, valores destacados).
  static const bodyStrong = TextStyle(fontSize: 16, fontWeight: FontWeight.w600);

  /// Metadatos, etiquetas y notas al pie.
  static const caption = TextStyle(fontSize: 13, fontWeight: FontWeight.w400);

  /// Metadatos con énfasis (insignias, encabezados de columna).
  static const captionStrong =
      TextStyle(fontSize: 13, fontWeight: FontWeight.w600);

  /// El `TextTheme` de Material mapeado a la escala, para que los widgets del
  /// framework (diálogos, menús, snackbars) hereden los mismos tamaños.
  static const textTheme = TextTheme(
    displayLarge: h1,
    displayMedium: h1,
    headlineLarge: h1,
    headlineMedium: h2,
    headlineSmall: h3,
    titleLarge: h3,
    titleMedium: bodyStrong,
    titleSmall: bodyStrong,
    bodyLarge: body,
    bodyMedium: body,
    bodySmall: caption,
    labelLarge: bodyStrong,
    labelMedium: captionStrong,
    labelSmall: captionStrong,
  );
}

/// Devuelve (color de texto, fondo suave, emoji, etiqueta) para un nivel de
/// riesgo. DESIGN.md §12: siempre color + significado, nunca solo color.
class RiskStyle {
  final Color color;
  final Color background;
  final String emoji;
  final String label;
  const RiskStyle(this.color, this.background, this.emoji, this.label);

  static RiskStyle of(String nivel, {bool isDark = false}) {
    switch (nivel.toUpperCase()) {
      case 'ALTO':
      case 'HIGH':
        final t = SemanticTone.resolve(SemanticKind.danger, isDark);
        return RiskStyle(t.fg, t.bg, '🔴', 'Riesgo Alto');
      case 'MEDIO':
      case 'MEDIUM':
        final t = SemanticTone.resolve(SemanticKind.warning, isDark);
        return RiskStyle(t.fg, t.bg, '🟡', 'Riesgo Medio');
      default:
        final t = SemanticTone.resolve(SemanticKind.success, isDark);
        return RiskStyle(t.fg, t.bg, '🟢', 'Sin riesgo');
    }
  }

  /// Resuelve contra el tema activo.
  static RiskStyle from(BuildContext context, String nivel) =>
      of(nivel, isDark: Theme.of(context).brightness == Brightness.dark);
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
      onSecondary: AppColors.text,
      error: AppColors.danger,
      surface: AppColors.surface,
      onSurface: AppColors.text,
      outline: AppColors.border,
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
      onPrimary: AppColors.bgDark, // Texto oliva oscuro sobre lima
      // Oliva apagado, no lima otra vez: DESIGN.md §4 limita a dos tonos de
      // lima/oliva visibles por pantalla y el primario ya gasta uno.
      secondary: AppColors.accentSecondary,
      onSecondary: AppColors.bgDark,
      error: AppColors.dangerDark,
      onError: AppColors.bgDark,
      surface: AppColors.surfaceDark,
      onSurface: AppColors.textDark,
      outline: AppColors.borderStrongDark,
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
      // Inter va empaquetada; Roboto es el respaldo declarado por DESIGN.md §5
      // y además la fuente del sistema en Android, así que un fallo de carga
      // degrada a algo previsible en vez de a la fuente genérica del motor.
      fontFamily: 'Inter',
      fontFamilyFallback: const ['Roboto'],
      textTheme: AppType.textTheme.apply(
        bodyColor: text,
        displayColor: text,
      ),
      appBarTheme: AppBarTheme(
        backgroundColor: surface,
        foregroundColor: text,
        elevation: 0,
        centerTitle: false,
        scrolledUnderElevation: 0.5,
        titleTextStyle: AppType.h3.copyWith(color: text),
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
          textStyle: AppType.bodyStrong.copyWith(fontWeight: FontWeight.w700),
        ),
      ),
      navigationRailTheme: NavigationRailThemeData(
        backgroundColor: surface,
        indicatorColor: scheme.primary.withValues(alpha: 0.16),
        selectedIconTheme: IconThemeData(color: scheme.primary),
        selectedLabelTextStyle:
            AppType.captionStrong.copyWith(color: scheme.primary),
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
