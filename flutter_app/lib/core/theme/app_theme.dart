import 'package:flutter/material.dart';

/// Sistema de diseño — UTS Nexus Académico (móvil).
///
/// Implementa los tokens de DESIGN.md: paleta institucional, colores
/// semánticos, espaciado y radios. Un color = un significado.
class AppColors {
  // ── Modo claro — institucional ─────────────────────────────────────────
  // El tema claro original teñía de verde todo: fondo #F4F7F1, superficies
  // #EAF0E6, texto #12271E. Un tinte de marca sobre superficies grandes no
  // comunica identidad, satura: el ojo no tiene ningún neutro donde descansar.
  // Esa lección se mantiene y las superficies siguen siendo neutras.
  //
  // Lo que cambió es el acento. Era oro #F4C430, un color que no aparece en
  // ninguna otra parte de la marca ni en el modo oscuro: la aplicación tenía
  // dos identidades según el tema. Ahora los dos modos comparten la lima
  // #CAD225, que es la que DESIGN.md §4 declara como acento de marca. En claro
  // la lima es RELLENO con letra oscura encima (8.9:1) y nunca texto (1.7:1
  // sobre blanco); cuando el acento tiene que ser texto se usa [accentStrong].
  static const primary = Color(0xFF0B5D3B); // Verde institucional
  static const primaryHover = Color(0xFF0D6E46);
  static const primaryActive = Color(0xFF08472E);
  // Tintas opacas del verde. Antes el estado seleccionado se pintaba con
  // `primary.withValues(alpha: 0.16)` en cada sitio, y una capa translúcida
  // sobre una card da un tono distinto que sobre el fondo de página: la misma
  // selección cambiaba de color según dónde cayera.
  static const primarySoft = Color(0xFFE8F2EC);
  static const primaryTint = Color(0xFFD2E5DB);

  static const secondary = Color(0xFFCAD225); // Lima (acento en los dos modos)
  static const lime = Color(0xFFCAD225);
  static const accentStrong = Color(0xFF626D0F); // La lima como TEXTO (5.8:1)
  // Semilla histórica del esquema oscuro. `ColorScheme.fromSeed` deriva de ella
  // los tonos que el `copyWith` no fija (contenedores, surfaceTint, terciarios),
  // así que si el oscuro tomara la semilla de `primary` cambiaría al repintar el
  // claro. Se conserva aparte justamente para que no lo haga.
  static const seedDark = Color(0xFF144D37);
  static const success = Color(0xFF067647); // Aprobado / riesgo bajo
  static const warning = Color(0xFFB54708); // Riesgo medio (ámbar, ≠ lima)
  static const danger = Color(0xFFD92D20); // Riesgo alto / error
  static const info = Color(0xFF175CD3); // Informativo

  // Neutros (claro)
  static const bg = Color(0xFFF4F6F8); // Fondo general
  static const surface = Color(0xFFFFFFFF); // Cards
  static const surfaceAlt = Color(0xFFF3F5F8); // Cabeceras / chips
  // Hundida: cabecera de tabla, barra de filtros, zona que contiene en vez de
  // presentar. Antes se resolvía con surfaceAlt y una barra de filtros acababa
  // exactamente del mismo tono que los chips que llevaba dentro.
  static const surfaceSunken = Color(0xFFEAEEF3);
  static const border = Color(0xFFE3E8EE); // Bordes sutiles
  static const borderStrong = Color(0xFFCCD3DD);
  static const text = Color(0xFF16202B); // Texto principal
  // El escalón más claro de la guía (#98A2B3) se queda en 2.8:1 sobre blanco.
  // Este token lo llevan subtítulos y ayudas de campo, que son texto real y
  // tienen que pasar AA: se usa el inmediatamente superior, 5.5:1.
  static const textMuted = Color(0xFF5D6B7A); // Texto secundario
  // Decorativo, NUNCA texto: separadores, iconos apagados, marcadores de
  // posición de campo. 3.2:1 — no pasa AA, y por eso no lleva contenido.
  static const textSubtle = Color(0xFF8794A3);

  // Fondos suaves para badges, con su borde.
  //
  // El borde es nuevo. Un chip `successSoft` sobre `surfaceAlt` se distingue
  // del fondo por unos pocos puntos de luminancia: en la lista de riesgo, que
  // es donde el color tiene que comunicar de un vistazo, los chips se fundían
  // con la fila y había que leer la etiqueta para saber de qué color eran.
  static const successSoft = Color(0xFFECFDF3);
  static const successBorder = Color(0xFFABEFC6);
  static const warningSoft = Color(0xFFFFFAEB);
  static const warningBorder = Color(0xFFFEDF89);
  static const dangerSoft = Color(0xFFFEF3F2);
  static const dangerBorder = Color(0xFFFECDCA);
  static const infoSoft = Color(0xFFEFF8FF);
  static const infoBorder = Color(0xFFB2DDFF);
  static const accentSoft = Color(0xFFF4F7D9); // Lima suave
  static const accentBorder = Color(0xFFDDE49B);

  // Ámbar oscuro para texto de riesgo medio (contraste AA sobre fondo claro)
  static const warningText = Color(0xFFB54708);

  // Acento secundario (DESIGN.md §4): hover de botones secundarios, iconos
  // relevantes pero inactivos, barras de progreso secundarias. 3.3:1 sobre
  // blanco: no es texto.
  static const accentSecondary = Color(0xFF8A9615);

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
  // La contrapartida oscura del pozo va HACIA ABAJO: en oscuro elevarse es
  // aclararse, así que hundirse es oscurecerse.
  static const surfaceSunkenDark = Color(0xFF1E231D);
  // DESIGN.md admite el tono de borde al 25–35% en divisores sutiles; este es
  // #696B3E resuelto al 30% sobre la superficie de card.
  static const borderDark = Color(0xFF43442F);
  static const borderStrongDark = Color(0xFF696B3E);
  static const textDark = Color(0xFFEDEFDD); // Crema-lima, no lima puro
  static const textMutedDark = Color(0xFFA6AA8A);
  static const textSubtleDark = Color(0xFF75785F);
  static const primarySoftDark = Color(0xFF33371F);
  static const primaryTintDark = Color(0xFF3F4526);

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
  static const successBorderDark = Color(0xFF2F5C3A);
  static const warningSoftDark = Color(0xFF40320F);
  static const warningBorderDark = Color(0xFF6B5518);
  static const dangerSoftDark = Color(0xFF43201D);
  static const dangerBorderDark = Color(0xFF6E332F);
  static const infoSoftDark = Color(0xFF123A44);
  static const infoBorderDark = Color(0xFF1D5C6B);
  static const accentSoftDark = Color(0xFF3A3D1C);
  static const accentBorderDark = Color(0xFF585C2A);
}

/// Los colores del tema activo, resueltos una vez.
///
/// Existe porque `isDark ? AppColors.textMutedDark : AppColors.textMuted`
/// aparecía cincuenta y cinco veces repartido por las pantallas. No es solo
/// ruido: cada una de esas cincuenta y cinco copias es un sitio donde se puede
/// olvidar el caso oscuro, y olvidarlo no da error —da texto gris oscuro sobre
/// fondo oliva, que solo se ve cambiando de tema a mano.
///
/// Se lee con `context.palette`.
class AppPalette {
  final bool isDark;

  final Color bg;
  final Color surface;
  final Color surfaceAlt;
  final Color surfaceSunken;
  final Color border;
  final Color borderStrong;
  final Color text;
  final Color muted;
  final Color subtle;
  final Color primary;
  final Color primarySoft;
  final Color primaryTint;
  final Color accent;
  final Color accentStrong;
  final Color accentSecondary;

  const AppPalette._({
    required this.isDark,
    required this.bg,
    required this.surface,
    required this.surfaceAlt,
    required this.surfaceSunken,
    required this.border,
    required this.borderStrong,
    required this.text,
    required this.muted,
    required this.subtle,
    required this.primary,
    required this.primarySoft,
    required this.primaryTint,
    required this.accent,
    required this.accentStrong,
    required this.accentSecondary,
  });

  static const light = AppPalette._(
    isDark: false,
    bg: AppColors.bg,
    surface: AppColors.surface,
    surfaceAlt: AppColors.surfaceAlt,
    surfaceSunken: AppColors.surfaceSunken,
    border: AppColors.border,
    borderStrong: AppColors.borderStrong,
    text: AppColors.text,
    muted: AppColors.textMuted,
    subtle: AppColors.textSubtle,
    primary: AppColors.primary,
    primarySoft: AppColors.primarySoft,
    primaryTint: AppColors.primaryTint,
    accent: AppColors.lime,
    accentStrong: AppColors.accentStrong,
    accentSecondary: AppColors.accentSecondary,
  );

  static const dark = AppPalette._(
    isDark: true,
    bg: AppColors.bgDark,
    surface: AppColors.surfaceDark,
    surfaceAlt: AppColors.surfaceAltDark,
    surfaceSunken: AppColors.surfaceSunkenDark,
    border: AppColors.borderDark,
    borderStrong: AppColors.borderStrongDark,
    text: AppColors.textDark,
    muted: AppColors.textMutedDark,
    subtle: AppColors.textSubtleDark,
    // En oscuro la lima es el color primario de interacción (DESIGN.md §4).
    primary: AppColors.lime,
    primarySoft: AppColors.primarySoftDark,
    primaryTint: AppColors.primaryTintDark,
    accent: AppColors.lime,
    // Sobre las superficies oliva la lima ya llega a 9.9:1: bajarla como en
    // claro la haría ilegible.
    accentStrong: AppColors.lime,
    accentSecondary: Color(0xFF999E3C),
  );

  static AppPalette of(BuildContext context) =>
      Theme.of(context).brightness == Brightness.dark ? dark : light;
}

extension AppPaletteContext on BuildContext {
  /// Colores del tema activo. Ver [AppPalette].
  AppPalette get palette => AppPalette.of(this);
}

/// Degradados de marca.
///
/// Solo para superficies que representan a la aplicación —cabecera del panel,
/// tarjeta de la clase en curso, pantalla de acceso—, nunca detrás de una
/// lista: el degradado cambia de tono a lo largo del bloque y cada fila
/// acabaría sobre un fondo distinto.
class AppGradients {
  /// En oscuro NO es lima: DESIGN.md §4 regla 2 prohíbe la lima como fondo de
  /// superficie grande. Es la rampa oliva subiendo un paso.
  static LinearGradient brand(bool isDark) => isDark
      ? const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF3F4534), Color(0xFF33332A), Color(0xFF262B21)],
          stops: [0, 0.55, 1],
        )
      : const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF0D6E46), Color(0xFF0B5D3B), Color(0xFF08472E)],
          stops: [0, 0.55, 1],
        );

  /// Velo lima sobre el degradado de marca: profundidad sin tocar el contraste
  /// del texto, porque solo aclara una esquina.
  static RadialGradient veil(bool isDark) => RadialGradient(
        center: const Alignment(0.7, -1),
        radius: 1.2,
        colors: [
          AppColors.lime.withValues(alpha: isDark ? 0.12 : 0.22),
          AppColors.lime.withValues(alpha: 0),
        ],
      );

  static const accent = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFFD8E04A), Color(0xFFCAD225)],
  );
}

/// Sombras.
///
/// Dos capas por nivel, no una. Una sombra sola tiene que elegir entre marcar
/// el contacto (corta y densa) o la altura (larga y difusa), y acaba haciendo
/// mal las dos cosas: o la tarjeta parece pegada con un halo gris, o flota sin
/// apoyarse en nada.
class AppShadows {
  static List<BoxShadow> sm(bool isDark) => [
        BoxShadow(
          color: Colors.black.withValues(alpha: isDark ? 0.3 : 0.04),
          blurRadius: 2,
          offset: const Offset(0, 1),
        ),
        BoxShadow(
          color: Colors.black.withValues(alpha: isDark ? 0.2 : 0.06),
          blurRadius: 3,
          offset: const Offset(0, 1),
        ),
      ];

  static List<BoxShadow> md(bool isDark) => [
        BoxShadow(
          color: Colors.black.withValues(alpha: isDark ? 0.24 : 0.04),
          blurRadius: 4,
          offset: const Offset(0, 2),
        ),
        BoxShadow(
          color: Colors.black.withValues(alpha: isDark ? 0.34 : 0.08),
          blurRadius: 16,
          spreadRadius: -4,
          offset: const Offset(0, 8),
        ),
      ];

  static List<BoxShadow> lg(bool isDark) => [
        BoxShadow(
          color: Colors.black.withValues(alpha: isDark ? 0.28 : 0.05),
          blurRadius: 8,
          offset: const Offset(0, 4),
        ),
        BoxShadow(
          color: Colors.black.withValues(alpha: isDark ? 0.44 : 0.12),
          blurRadius: 32,
          spreadRadius: -8,
          offset: const Offset(0, 20),
        ),
      ];
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

/// Par resuelto (color de texto/icono, fondo suave, borde) para un estado.
///
/// El borde llegó con los chips: sin él, un fondo suave sobre `surfaceAlt` no
/// tiene contorno y el bloque de color deja de leerse como una insignia.
class SemanticTone {
  final Color fg;
  final Color bg;
  final Color border;
  const SemanticTone(this.fg, this.bg, this.border);

  static SemanticTone resolve(SemanticKind kind, bool isDark) {
    switch (kind) {
      case SemanticKind.success:
        return isDark
            ? const SemanticTone(AppColors.successDark, AppColors.successSoftDark,
                AppColors.successBorderDark)
            : const SemanticTone(
                AppColors.success, AppColors.successSoft, AppColors.successBorder);
      case SemanticKind.warning:
        return isDark
            ? const SemanticTone(AppColors.warningDark, AppColors.warningSoftDark,
                AppColors.warningBorderDark)
            // En claro el ámbar de marca no llega a AA como texto: se usa el
            // ámbar oscuro para la letra y el de marca queda para indicadores.
            : const SemanticTone(
                AppColors.warningText, AppColors.warningSoft, AppColors.warningBorder);
      case SemanticKind.danger:
        return isDark
            ? const SemanticTone(
                AppColors.dangerDark, AppColors.dangerSoftDark, AppColors.dangerBorderDark)
            : const SemanticTone(
                AppColors.danger, AppColors.dangerSoft, AppColors.dangerBorder);
      case SemanticKind.info:
        return isDark
            ? const SemanticTone(
                AppColors.infoDark, AppColors.infoSoftDark, AppColors.infoBorderDark)
            : const SemanticTone(AppColors.info, AppColors.infoSoft, AppColors.infoBorder);
      case SemanticKind.brand:
        // El verde institucional desaparece sobre las superficies oliva; en
        // oscuro la marca la lleva la lima, que §4 admite en badges pequeños.
        return isDark
            ? const SemanticTone(
                AppColors.lime, AppColors.accentSoftDark, AppColors.accentBorderDark)
            : const SemanticTone(
                AppColors.primary, AppColors.accentSoft, AppColors.accentBorder);
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

  static const double radiusCard = 16;
  static const double radiusInput = 12;
  static const double radiusLarge = 24;
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
  static const Duration slow = Duration(milliseconds: 320);
  static const Curve curve = Curves.easeOutCubic;

  /// Rebote contenido para lo que aparece: un panel, un chip al seleccionarse.
  /// No se usa en nada que se mueva más de una vez por interacción.
  static const Curve spring = Curves.easeOutBack;
}

/// Escala tipográfica (DESIGN.md §5): cinco pasos, uno por rol.
///
/// Antes cada pantalla elegía su tamaño a mano y convivían dieciocho valores
/// distintos, varios con medio punto. Un tamaño fuera de esta escala es un
/// error, no una variante.
class AppType {
  /// Título de página.
  ///
  /// El interletrado negativo no es un adorno: Inter está dibujada para texto
  /// corrido y a 36 px el espacio entre letras que le sienta bien a 16 se ve
  /// como si el título estuviera desmontado.
  static const h1 = TextStyle(
    fontSize: 36,
    fontWeight: FontWeight.w800,
    letterSpacing: -0.8,
    height: 1.1,
  );

  /// Sección principal.
  static const h2 = TextStyle(
    fontSize: 30,
    fontWeight: FontWeight.w700,
    letterSpacing: -0.6,
    height: 1.15,
  );

  /// Subsección o título de tarjeta.
  static const h3 = TextStyle(
    fontSize: 24,
    fontWeight: FontWeight.w700,
    letterSpacing: -0.4,
    height: 1.2,
  );

  /// Texto general.
  static const body = TextStyle(fontSize: 16, fontWeight: FontWeight.w400, height: 1.45);

  /// Texto general con énfasis (etiquetas de botón, valores destacados).
  static const bodyStrong =
      TextStyle(fontSize: 16, fontWeight: FontWeight.w600, height: 1.35);

  /// Metadatos, etiquetas y notas al pie.
  static const caption = TextStyle(fontSize: 13, fontWeight: FontWeight.w400, height: 1.35);

  /// Metadatos con énfasis (insignias, encabezados de columna).
  static const captionStrong =
      TextStyle(fontSize: 13, fontWeight: FontWeight.w600, height: 1.3);

  /// Cifra de una métrica: la misma escala, pero con las cifras de ancho fijo.
  ///
  /// Sin `tabularFigures` una columna de notas se desalinea cada vez que
  /// aparece un 1, porque en Inter el uno proporcional es más estrecho. En una
  /// lista de treinta filas el ojo lo lee como si los números bailaran.
  static const metric = TextStyle(
    fontSize: 24,
    fontWeight: FontWeight.w700,
    letterSpacing: -0.4,
    height: 1.1,
    fontFeatures: [FontFeature.tabularFigures()],
  );

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
  final Color border;

  /// El icono es lo que hace que el nivel se distinga sin ver el color.
  ///
  /// Los emojis 🔴🟡🟢 que llevaba antes no cumplían ese papel: los tres son un
  /// círculo, así que para alguien que no distingue el rojo del verde las tres
  /// insignias eran idénticas salvo por la etiqueta. Estos tres tienen silueta
  /// distinta —escudo, triángulo, círculo con marca— y son los mismos que usa
  /// el escritorio.
  final IconData icon;
  final String emoji;
  final String label;
  const RiskStyle(
    this.color,
    this.background,
    this.border,
    this.icon,
    this.emoji,
    this.label,
  );

  static RiskStyle of(String nivel, {bool isDark = false}) {
    switch (nivel.toUpperCase()) {
      case 'ALTO':
      case 'HIGH':
        final t = SemanticTone.resolve(SemanticKind.danger, isDark);
        return RiskStyle(
            t.fg, t.bg, t.border, Icons.gpp_maybe_outlined, '🔴', 'Riesgo Alto');
      case 'MEDIO':
      case 'MEDIUM':
        final t = SemanticTone.resolve(SemanticKind.warning, isDark);
        return RiskStyle(
            t.fg, t.bg, t.border, Icons.warning_amber_rounded, '🟡', 'Riesgo Medio');
      default:
        final t = SemanticTone.resolve(SemanticKind.success, isDark);
        return RiskStyle(
            t.fg, t.bg, t.border, Icons.check_circle_outline, '🟢', 'Sin riesgo');
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
      primaryContainer: AppColors.primarySoft,
      onPrimaryContainer: AppColors.primary,
      secondary: AppColors.secondary,
      onSecondary: AppColors.text,
      secondaryContainer: AppColors.accentSoft,
      onSecondaryContainer: AppColors.accentStrong,
      error: AppColors.danger,
      surface: AppColors.surface,
      onSurface: AppColors.text,
      surfaceContainerHighest: AppColors.surfaceAlt,
      outline: AppColors.border,
      outlineVariant: AppColors.borderStrong,
    );
    return _base(scheme, AppPalette.light);
  }

  static ThemeData get dark {
    final scheme = ColorScheme.fromSeed(
      seedColor: AppColors.seedDark,
      brightness: Brightness.dark,
    ).copyWith(
      primary: AppColors.lime, // La lima es el acento principal en oscuro
      onPrimary: AppColors.bgDark, // Texto oliva oscuro sobre lima
      primaryContainer: AppColors.primarySoftDark,
      onPrimaryContainer: AppColors.lime,
      // Oliva apagado, no lima otra vez: DESIGN.md §4 limita a dos tonos de
      // lima/oliva visibles por pantalla y el primario ya gasta uno.
      secondary: AppColors.accentSecondary,
      onSecondary: AppColors.bgDark,
      secondaryContainer: AppColors.accentSoftDark,
      onSecondaryContainer: AppColors.lime,
      error: AppColors.dangerDark,
      onError: AppColors.bgDark,
      surface: AppColors.surfaceDark,
      onSurface: AppColors.textDark,
      surfaceContainerHighest: AppColors.surfaceAltDark,
      outline: AppColors.borderStrongDark,
      outlineVariant: AppColors.borderDark,
    );
    return _base(scheme, AppPalette.dark);
  }

  static ThemeData _base(ColorScheme scheme, AppPalette palette) {
    final text = palette.text;
    final border = palette.border;
    final surface = palette.surface;

    return ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      scaffoldBackgroundColor: palette.bg,
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
        // La cabecera va del color del FONDO, no de la superficie de card.
        // Con `surface` la barra era un rectángulo claro sobre el fondo de la
        // página y dibujaba una línea horizontal permanente en lo alto de todas
        // las pantallas, aunque no hubiera nada que separar.
        backgroundColor: palette.bg,
        surfaceTintColor: Colors.transparent,
        foregroundColor: text,
        elevation: 0,
        centerTitle: false,
        scrolledUnderElevation: 0,
        titleTextStyle: AppType.bodyStrong.copyWith(
          color: text,
          fontWeight: FontWeight.w800,
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: surface,
        // 12 en vez de 14: en un formulario de seis campos son 24 dp menos
        // sin que el campo deje de ser cómodo de tocar (sigue en 48 de alto).
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        hintStyle: AppType.body.copyWith(color: palette.subtle),
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
          minimumSize: const Size(0, AppSpacing.tapTarget),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppSpacing.radiusInput),
          ),
          textStyle: AppType.bodyStrong.copyWith(fontWeight: FontWeight.w700),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: scheme.primary,
          side: BorderSide(color: palette.borderStrong),
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
          minimumSize: const Size(0, AppSpacing.tapTarget),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppSpacing.radiusInput),
          ),
          textStyle: AppType.bodyStrong,
        ),
      ),
      navigationRailTheme: NavigationRailThemeData(
        backgroundColor: surface,
        indicatorColor: palette.primarySoft,
        selectedIconTheme: IconThemeData(color: scheme.primary),
        selectedLabelTextStyle:
            AppType.captionStrong.copyWith(color: scheme.primary),
        unselectedIconTheme: IconThemeData(color: palette.muted),
        unselectedLabelTextStyle: AppType.caption.copyWith(color: palette.muted),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: surface,
        // Tinta opaca y no una capa al 16%: el indicador cae sobre la barra y
        // sobre nada más, así que no hace falta translucidez, y una tinta
        // opaca no cambia de tono si algún día la barra deja de ser blanca.
        indicatorColor: palette.primarySoft,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        labelTextStyle: WidgetStateProperty.resolveWith((estados) {
          final activo = estados.contains(WidgetState.selected);
          return AppType.caption.copyWith(
            fontWeight: activo ? FontWeight.w700 : FontWeight.w500,
            color: activo ? scheme.primary : palette.muted,
          );
        }),
        iconTheme: WidgetStateProperty.resolveWith((estados) {
          final activo = estados.contains(WidgetState.selected);
          return IconThemeData(
            size: 22,
            color: activo ? scheme.primary : palette.muted,
          );
        }),
      ),
      dividerTheme: DividerThemeData(color: border, thickness: 1, space: 1),
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: surface,
        surfaceTintColor: Colors.transparent,
        showDragHandle: true,
        dragHandleColor: palette.borderStrong,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(
            top: Radius.circular(AppSpacing.radiusLarge),
          ),
        ),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: surface,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
        ),
        titleTextStyle: AppType.bodyStrong.copyWith(color: text, fontWeight: FontWeight.w700),
        contentTextStyle: AppType.body.copyWith(color: palette.muted),
      ),
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
        subtitleTextStyle: AppType.caption.copyWith(color: palette.muted),
        selectedColor: scheme.primary,
        selectedTileColor: palette.primarySoft,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppSpacing.radiusInput),
        ),
      ),
      chipTheme: ChipThemeData(
        labelStyle: AppType.captionStrong,
        backgroundColor: palette.surfaceAlt,
        side: BorderSide(color: border),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
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
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor: palette.isDark ? AppColors.surfaceAltDark : AppColors.text,
        contentTextStyle: AppType.body.copyWith(
          color: palette.isDark ? AppColors.textDark : Colors.white,
        ),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppSpacing.radiusInput),
        ),
      ),
    );
  }
}
