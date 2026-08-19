import 'package:flutter/material.dart';

/// Sistema de diseño — UTS Nexus Académico (móvil).
///
/// Implementa los tokens de DESIGN.md: paleta institucional, colores
/// semánticos, espaciado y radios. Un color = un significado.
class AppColors {
  // ── Modo claro — institucional ─────────────────────────────────────────
  // El tema claro anterior teñía de verde todo: fondo #F4F7F1, superficies
  // #EAF0E6, texto #12271E, y el lima #CAD225 como acento. Un tinte de marca
  // sobre superficies grandes no comunica identidad, satura: el ojo no tiene
  // ningún neutro donde descansar. Ahora los neutros son neutros y el verde
  // aparece solo donde hay una acción. El oro sustituye al lima como acento:
  // mismo papel de «mírame», sin el chillido.
  static const primary = Color(0xFF0B5D3B); // Verde institucional
  static const secondary = Color(0xFFF4C430); // Oro (acento en claro)
  static const lime = Color(0xFFCAD225); // Solo modo oscuro
  // Semilla histórica del esquema oscuro. `ColorScheme.fromSeed` deriva de ella
  // los tonos que el `copyWith` no fija (contenedores, surfaceTint, terciarios),
  // así que si el oscuro tomara la semilla de `primary` cambiaría al repintar el
  // claro. Se conserva aparte justamente para que no lo haga.
  static const seedDark = Color(0xFF144D37);
  static const success = Color(0xFF067647); // Aprobado / riesgo bajo
  static const warning = Color(0xFFB54708); // Riesgo medio (ámbar, ≠ oro)
  static const danger = Color(0xFFD92D20); // Riesgo alto / error
  static const info = Color(0xFF175CD3); // Informativo

  // Neutros (claro)
  static const bg = Color(0xFFF7F8FA); // Fondo general
  static const surface = Color(0xFFFFFFFF); // Cards
  static const surfaceAlt = Color(0xFFF1F3F5); // Cabeceras / chips
  static const border = Color(0xFFE4E7EC); // Bordes sutiles
  static const text = Color(0xFF1F2937); // Texto principal
  // El escalón más claro de la guía (#98A2B3) se queda en 2.8:1 sobre blanco.
  // Este token lo llevan subtítulos y ayudas de campo, que son texto real y
  // tienen que pasar AA: se usa el inmediatamente superior, 5.3:1.
  static const textMuted = Color(0xFF667085); // Texto secundario

  // Fondos suaves para badges
  static const successSoft = Color(0xFFECFDF3);
  static const warningSoft = Color(0xFFFFFAEB);
  static const dangerSoft = Color(0xFFFEF3F2);
  static const infoSoft = Color(0xFFEFF8FF);
  static const accentSoft = Color(0xFFFFF8D9); // Oro suave

  // Ámbar oscuro para texto de riesgo medio (contraste AA sobre fondo claro)
  static const warningText = Color(0xFFB54708);

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

/// Espaciado y radios (DESIGN.md §7), en su escala compacta.
///
/// Los valores bajaron de 24/16/18 a 16/12/14. No es un ajuste estético: en un
/// teléfono de 360 dp, 24 de margen exterior más 16 de interior dejaban unos
/// 280 dp útiles y cada fila académica ocupaba casi cien de alto, así que en
/// pantalla cabían cinco estudiantes. Pasar lista a un salón de treinta
/// significaba seis pantallazos completos.
///
/// Lo que NO se toca es el tamaño de lo que se toca: [tapTarget] se queda en
/// 48 dp y ninguna acción baja de [tapTargetMin]. La densidad se gana con el
/// espacio entre elementos y con el relleno, nunca haciendo más pequeño el
/// blanco de un dedo.
class AppSpacing {
  /// Margen lateral de página.
  static const double page = 16;

  /// Separación estándar entre bloques.
  static const double gap = 12;

  /// Separación corta: entre una etiqueta y su valor, entre chips.
  static const double gapSm = 8;

  /// Separación mínima: dentro de una fila densa.
  static const double gapXs = 4;

  static const double radiusCard = 14;
  static const double radiusInput = 10;
  static const double radiusPill = 999;

  /// Alto mínimo de una fila académica pulsable.
  static const double rowHeight = 56;

  /// Objetivo táctil recomendado. Los botones de icono lo usan como tamaño.
  static const double tapTarget = 48;

  /// Mínimo absoluto aceptable. Por debajo de esto no baja ningún control.
  static const double tapTargetMin = 44;

  /// Relleno estándar de página.
  ///
  /// El extra al final no es decorativo: sin él, la última fila queda debajo
  /// de la barra de navegación y no se puede tocar.
  static const EdgeInsets pagePadding =
      EdgeInsets.fromLTRB(page, gap, page, page + tapTarget);

  /// Relleno de una lista que ya trae sus propias separaciones.
  static const EdgeInsets listPadding =
      EdgeInsets.fromLTRB(page, gapSm, page, tapTarget + gap);
}

/// Duraciones de animación (DESIGN.md §17).
///
/// Cortas y con una sola curva. Una transición de 300 ms en una pantalla que
/// se abre veinte veces al día son seis segundos al día esperando a que algo
/// termine de moverse.
class AppMotion {
  static const Duration fast = Duration(milliseconds: 120);
  static const Duration normal = Duration(milliseconds: 180);
  static const Curve curve = Curves.easeOutCubic;
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
      seedColor: AppColors.seedDark,
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
        // 12 en vez de 14: en un formulario de seis campos son 24 dp menos
        // sin que el campo deje de ser cómodo de tocar (sigue en 48 de alto).
        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
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
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
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
      /*
       * Densidad de los widgets del framework.
       *
       * `standard` deja las listas de Material con el alto pensado para una
       * tablet. `compact` recorta unos 8 dp por fila, que en una lista de
       * treinta estudiantes son casi cuatro filas más visibles.
       *
       * `materialTapTargetSize` se queda en `padded`: es lo que garantiza los
       * 48 dp de objetivo táctil aunque el icono mida 20. Bajarlo a
       * `shrinkWrap` sería ganar densidad quitándole precisión al dedo.
       */
      visualDensity: VisualDensity.compact,
      materialTapTargetSize: MaterialTapTargetSize.padded,
      listTileTheme: ListTileThemeData(
        dense: true,
        minVerticalPadding: 6,
        horizontalTitleGap: 12,
        titleTextStyle: AppType.bodyStrong.copyWith(color: text),
        subtitleTextStyle: AppType.caption.copyWith(
          color: text.withValues(alpha: 0.7),
        ),
      ),
      chipTheme: ChipThemeData(
        labelStyle: AppType.captionStrong,
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppSpacing.radiusPill),
        ),
      ),
      cardTheme: CardThemeData(
        color: surface,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
          side: BorderSide(color: border),
        ),
      ),
    );
  }
}
