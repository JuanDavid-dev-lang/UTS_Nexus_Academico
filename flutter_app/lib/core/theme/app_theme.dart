import 'package:flutter/material.dart';

import 'appearance/appearance_preferences.dart';
import 'appearance/palettes.dart';

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

/// `#RRGGBB` → [Color]. Los hex de [TokensDeTono] y [Semantico] ya salen
/// normalizados (mayúsculas, con almohadilla), así que no hace falta pasar
/// por `normalizarHex` de nuevo.
///
/// Pública porque la pantalla de apariencia la necesita para pintar la
/// vista previa de un tono o una visión que todavía no es la activa —
/// `context.palette` solo resuelve la que ya está aplicada.
Color colorDeHex(String hex) =>
    Color(int.parse('FF${hex.substring(1)}', radix: 16));

/// Un par (color de texto/icono, fondo suave, borde) resuelto para el tono y
/// la visión activos. Ver [AppPalette.success] y compañía.
class SemanticTone {
  final Color fg;
  final Color bg;
  final Color border;
  const SemanticTone(this.fg, this.bg, this.border);

  factory SemanticTone._deSemantico(Semantico s) =>
      SemanticTone(colorDeHex(s.fg), colorDeHex(s.soft), colorDeHex(s.border));

  static SemanticTone _lerp(SemanticTone a, SemanticTone b, double t) =>
      SemanticTone(
        Color.lerp(a.fg, b.fg, t) ?? a.fg,
        Color.lerp(a.bg, b.bg, t) ?? a.bg,
        Color.lerp(a.border, b.border, t) ?? a.border,
      );

  /// Resuelve un estado semántico contra el tema activo.
  ///
  /// `brand` no es un estado de [TonosSemanticos]: es énfasis de marca
  /// (etiqueta de rol, chip de identidad) y se arma con el primario y el
  /// acento suave del TONO, no con la visión del color.
  static SemanticTone of(BuildContext context, SemanticKind kind) {
    final palette = context.palette;
    return switch (kind) {
      SemanticKind.success => palette.success,
      SemanticKind.warning => palette.warning,
      SemanticKind.danger => palette.danger,
      SemanticKind.info => palette.info,
      SemanticKind.brand => SemanticTone(
        palette.primary,
        palette.accentSoft,
        palette.accentSecondary,
      ),
    };
  }
}

/// Los colores del tono activo, resueltos una vez contra el tema de Material.
///
/// Existe porque `isDark ? AppColors.textMutedDark : AppColors.textMuted`
/// aparecía cincuenta y cinco veces repartido por las pantallas. No es solo
/// ruido: cada una de esas cincuenta y cinco copias es un sitio donde se puede
/// olvidar el caso oscuro, y olvidarlo no da error —da texto gris oscuro sobre
/// fondo oliva, que solo se ve cambiando de tema a mano.
///
/// Ahora además varía por tono y por visión del color: es una
/// `ThemeExtension`, así que cada `ThemeData` que construye [AppTheme] lleva
/// la suya y `Theme.of(context).extension<AppPalette>()` la resuelve como
/// cualquier otro dato de tema. Se lee con `context.palette`.
class AppPalette extends ThemeExtension<AppPalette> {
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
  final Color onPrimary;
  final Color primarySoft;
  final Color primaryTint;
  final Color accent;
  final Color onAccent;
  final Color accentStrong;
  final Color accentSecondary;
  final Color accentSoft;

  /// Tres paradas del degradado de marca y el color de su velo. Ver
  /// [AppGradients].
  final Color brandStart;
  final Color brandMid;
  final Color brandEnd;
  final Color veil;

  final SemanticTone success;
  final SemanticTone warning;
  final SemanticTone danger;
  final SemanticTone info;

  const AppPalette({
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
    required this.onPrimary,
    required this.primarySoft,
    required this.primaryTint,
    required this.accent,
    required this.onAccent,
    required this.accentStrong,
    required this.accentSecondary,
    required this.accentSoft,
    required this.brandStart,
    required this.brandMid,
    required this.brandEnd,
    required this.veil,
    required this.success,
    required this.warning,
    required this.danger,
    required this.info,
  });

  /// Arma la paleta a partir de los tokens de un tono y los tonos semánticos
  /// de una visión del color — la misma pareja de argumentos que recibe
  /// `tokensDeTono()`/`tonosSemanticos()` del lado del escritorio.
  factory AppPalette.desde({
    required TokensDeTono tokens,
    required TonosSemanticos semanticos,
    required bool isDark,
  }) {
    Color c(String hex) => colorDeHex(hex);
    return AppPalette(
      isDark: isDark,
      bg: c(tokens.bg),
      surface: c(tokens.surface),
      surfaceAlt: c(tokens.surfaceAlt),
      surfaceSunken: c(tokens.surfaceSunken),
      border: c(tokens.border),
      borderStrong: c(tokens.borderStrong),
      text: c(tokens.text),
      muted: c(tokens.textMuted),
      subtle: c(tokens.textSubtle),
      primary: c(tokens.primary),
      onPrimary: c(tokens.onPrimary),
      primarySoft: c(tokens.primarySoft),
      primaryTint: c(tokens.primaryTint),
      accent: c(tokens.accent),
      onAccent: c(tokens.onAccent),
      accentStrong: c(tokens.accentStrong),
      accentSecondary: c(tokens.accentSecondary),
      accentSoft: c(tokens.accentSoft),
      brandStart: c(tokens.brandStart),
      brandMid: c(tokens.brandMid),
      brandEnd: c(tokens.brandEnd),
      veil: c(tokens.veil),
      success: SemanticTone._deSemantico(semanticos.success),
      warning: SemanticTone._deSemantico(semanticos.warning),
      danger: SemanticTone._deSemantico(semanticos.danger),
      info: SemanticTone._deSemantico(semanticos.info),
    );
  }

  /// Paleta institucional en visión normal: lo que se pintaba antes de que
  /// existiera el tono elegible, y lo que se usa cuando el widget que pide
  /// `context.palette` no cuelga de un `ThemeData` construido por
  /// [AppTheme] (por ejemplo, una prueba que arma su propio `MaterialApp`
  /// sin tema).
  static AppPalette _institucionalDe(Brightness brightness) {
    final modo = brightness == Brightness.dark
        ? ModoResuelto.dark
        : ModoResuelto.light;
    return AppPalette.desde(
      tokens: tokensDeTono(Tono.institucional, modo),
      semanticos: tonosSemanticos(VisionColor.normal, modo),
      isDark: brightness == Brightness.dark,
    );
  }

  static AppPalette of(BuildContext context) {
    final theme = Theme.of(context);
    return theme.extension<AppPalette>() ?? _institucionalDe(theme.brightness);
  }

  @override
  AppPalette copyWith({
    bool? isDark,
    Color? bg,
    Color? surface,
    Color? surfaceAlt,
    Color? surfaceSunken,
    Color? border,
    Color? borderStrong,
    Color? text,
    Color? muted,
    Color? subtle,
    Color? primary,
    Color? onPrimary,
    Color? primarySoft,
    Color? primaryTint,
    Color? accent,
    Color? onAccent,
    Color? accentStrong,
    Color? accentSecondary,
    Color? accentSoft,
    Color? brandStart,
    Color? brandMid,
    Color? brandEnd,
    Color? veil,
    SemanticTone? success,
    SemanticTone? warning,
    SemanticTone? danger,
    SemanticTone? info,
  }) => AppPalette(
    isDark: isDark ?? this.isDark,
    bg: bg ?? this.bg,
    surface: surface ?? this.surface,
    surfaceAlt: surfaceAlt ?? this.surfaceAlt,
    surfaceSunken: surfaceSunken ?? this.surfaceSunken,
    border: border ?? this.border,
    borderStrong: borderStrong ?? this.borderStrong,
    text: text ?? this.text,
    muted: muted ?? this.muted,
    subtle: subtle ?? this.subtle,
    primary: primary ?? this.primary,
    onPrimary: onPrimary ?? this.onPrimary,
    primarySoft: primarySoft ?? this.primarySoft,
    primaryTint: primaryTint ?? this.primaryTint,
    accent: accent ?? this.accent,
    onAccent: onAccent ?? this.onAccent,
    accentStrong: accentStrong ?? this.accentStrong,
    accentSecondary: accentSecondary ?? this.accentSecondary,
    accentSoft: accentSoft ?? this.accentSoft,
    brandStart: brandStart ?? this.brandStart,
    brandMid: brandMid ?? this.brandMid,
    brandEnd: brandEnd ?? this.brandEnd,
    veil: veil ?? this.veil,
    success: success ?? this.success,
    warning: warning ?? this.warning,
    danger: danger ?? this.danger,
    info: info ?? this.info,
  );

  @override
  AppPalette lerp(ThemeExtension<AppPalette>? other, double t) {
    if (other is! AppPalette) return this;
    Color lc(Color a, Color b) => Color.lerp(a, b, t) ?? a;
    return AppPalette(
      isDark: t < 0.5 ? isDark : other.isDark,
      bg: lc(bg, other.bg),
      surface: lc(surface, other.surface),
      surfaceAlt: lc(surfaceAlt, other.surfaceAlt),
      surfaceSunken: lc(surfaceSunken, other.surfaceSunken),
      border: lc(border, other.border),
      borderStrong: lc(borderStrong, other.borderStrong),
      text: lc(text, other.text),
      muted: lc(muted, other.muted),
      subtle: lc(subtle, other.subtle),
      primary: lc(primary, other.primary),
      onPrimary: lc(onPrimary, other.onPrimary),
      primarySoft: lc(primarySoft, other.primarySoft),
      primaryTint: lc(primaryTint, other.primaryTint),
      accent: lc(accent, other.accent),
      onAccent: lc(onAccent, other.onAccent),
      accentStrong: lc(accentStrong, other.accentStrong),
      accentSecondary: lc(accentSecondary, other.accentSecondary),
      accentSoft: lc(accentSoft, other.accentSoft),
      brandStart: lc(brandStart, other.brandStart),
      brandMid: lc(brandMid, other.brandMid),
      brandEnd: lc(brandEnd, other.brandEnd),
      veil: lc(veil, other.veil),
      success: SemanticTone._lerp(success, other.success, t),
      warning: SemanticTone._lerp(warning, other.warning, t),
      danger: SemanticTone._lerp(danger, other.danger, t),
      info: SemanticTone._lerp(info, other.info, t),
    );
  }
}

extension AppPaletteContext on BuildContext {
  /// Colores del tono activo. Ver [AppPalette].
  AppPalette get palette => AppPalette.of(this);
}

/// Degradados de marca.
///
/// Solo para superficies que representan a la aplicación —cabecera del panel,
/// tarjeta de la clase en curso, pantalla de acceso—, nunca detrás de una
/// lista: el degradado cambia de tono a lo largo del bloque y cada fila
/// acabaría sobre un fondo distinto.
class AppGradients {
  /// Las tres paradas del tono activo, de la esquina clara a la oscura. En
  /// oscuro NUNCA es el color de acento puro: DESIGN.md §4 regla 2 prohíbe el
  /// acento como fondo de superficie grande, y `brandStart/Mid/End` de cada
  /// tono ya son la rampa neutra apagada que sustituye a la lima ahí.
  static LinearGradient brand(AppPalette palette) => LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [palette.brandStart, palette.brandMid, palette.brandEnd],
    stops: const [0, 0.55, 1],
  );

  /// Velo del color de acento sobre el degradado de marca: profundidad sin
  /// tocar el contraste del texto, porque solo aclara una esquina.
  static RadialGradient veil(AppPalette palette) => RadialGradient(
    center: const Alignment(0.7, -1),
    radius: 1.2,
    colors: [
      palette.veil.withValues(alpha: palette.isDark ? 0.12 : 0.22),
      palette.veil.withValues(alpha: 0),
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
  static const EdgeInsets pagePadding = EdgeInsets.fromLTRB(
    page,
    gap,
    page,
    page + tapTarget,
  );

  /// Relleno de una lista que ya trae sus propias separaciones.
  static const EdgeInsets listPadding = EdgeInsets.fromLTRB(
    page,
    gapSm,
    page,
    tapTarget + gap,
  );
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
  static const body = TextStyle(
    fontSize: 16,
    fontWeight: FontWeight.w400,
    height: 1.45,
  );

  /// Texto general con énfasis (etiquetas de botón, valores destacados).
  static const bodyStrong = TextStyle(
    fontSize: 16,
    fontWeight: FontWeight.w600,
    height: 1.35,
  );

  /// Metadatos, etiquetas y notas al pie.
  static const caption = TextStyle(
    fontSize: 13,
    fontWeight: FontWeight.w400,
    height: 1.35,
  );

  /// Metadatos con énfasis (insignias, encabezados de columna).
  static const captionStrong = TextStyle(
    fontSize: 13,
    fontWeight: FontWeight.w600,
    height: 1.3,
  );

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

  /// Resuelve contra el tema activo (tono y visión del color incluidos).
  static RiskStyle from(BuildContext context, String nivel) {
    switch (nivel.toUpperCase()) {
      case 'ALTO':
      case 'HIGH':
        final t = SemanticTone.of(context, SemanticKind.danger);
        return RiskStyle(
          t.fg,
          t.bg,
          t.border,
          Icons.gpp_maybe_outlined,
          '🔴',
          'Riesgo Alto',
        );
      case 'MEDIO':
      case 'MEDIUM':
        final t = SemanticTone.of(context, SemanticKind.warning);
        return RiskStyle(
          t.fg,
          t.bg,
          t.border,
          Icons.warning_amber_rounded,
          '🟡',
          'Riesgo Medio',
        );
      default:
        final t = SemanticTone.of(context, SemanticKind.success);
        return RiskStyle(
          t.fg,
          t.bg,
          t.border,
          Icons.check_circle_outline,
          '🟢',
          'Sin riesgo',
        );
    }
  }
}

class AppTheme {
  /// Tema institucional en visión normal, esquinas suaves. Es lo que
  /// pintaba la aplicación antes de que existiera la apariencia elegible, y
  /// lo que usan las pruebas y widgets que no necesitan una preferencia real.
  static ThemeData get light =>
      construir(AparienciaPreferencias.defecto, Brightness.light);

  static ThemeData get dark =>
      construir(AparienciaPreferencias.defecto, Brightness.dark);

  /// Arma el `ThemeData` de una combinación (tono, color propio, visión del
  /// color, esquinas) para un brillo dado. `app.dart` la llama una vez por
  /// brillo en cada build de `MaterialApp.router`; recalcularla es barato
  /// —son operaciones aritméticas sobre un puñado de colores, no E/S— y es lo
  /// que permite que cambiar el tono en Ajustes se vea al instante en las dos
  /// variantes (`theme`/`darkTheme`) sin reiniciar la aplicación.
  static ThemeData construir(
    AparienciaPreferencias prefs,
    Brightness brightness,
  ) {
    final isDark = brightness == Brightness.dark;
    final modo = isDark ? ModoResuelto.dark : ModoResuelto.light;
    final tokens = tokensDeTono(prefs.tono, modo, prefs.colorPropio);
    final semanticos = tonosSemanticos(prefs.vision, modo);
    final palette = AppPalette.desde(
      tokens: tokens,
      semanticos: semanticos,
      isDark: isDark,
    );

    final scheme = isDark
        ? ColorScheme.fromSeed(
            seedColor: palette.primary,
            brightness: Brightness.dark,
          ).copyWith(
            // En oscuro el acento del tono ES el primario de interacción
            // (DESIGN.md §4): `tokens.primary` ya vale lo mismo que
            // `tokens.accent` ahí.
            primary: palette.primary,
            onPrimary: palette.onPrimary,
            primaryContainer: palette.primarySoft,
            onPrimaryContainer: palette.primary,
            // Acento apagado, no el mismo tono otra vez: DESIGN.md §4 limita
            // a dos tonos de acento visibles por pantalla y el primario ya
            // gasta uno.
            secondary: palette.accentSecondary,
            onSecondary: palette.bg,
            secondaryContainer: palette.accentSoft,
            onSecondaryContainer: palette.primary,
            error: palette.danger.fg,
            onError: palette.bg,
            surface: palette.surface,
            onSurface: palette.text,
            surfaceContainerHighest: palette.surfaceAlt,
            outline: palette.borderStrong,
            outlineVariant: palette.border,
          )
        : ColorScheme.fromSeed(
            seedColor: palette.primary,
            brightness: Brightness.light,
          ).copyWith(
            primary: palette.primary,
            onPrimary: palette.onPrimary,
            primaryContainer: palette.primarySoft,
            onPrimaryContainer: palette.primary,
            secondary: palette.accent,
            onSecondary: palette.text,
            secondaryContainer: palette.accentSoft,
            onSecondaryContainer: palette.accentStrong,
            error: palette.danger.fg,
            surface: palette.surface,
            onSurface: palette.text,
            surfaceContainerHighest: palette.surfaceAlt,
            outline: palette.border,
            outlineVariant: palette.borderStrong,
          );

    return _base(
      scheme,
      palette,
      prefs.esquinas.factor,
      sinTransiciones: prefs.reducirMovimiento,
    );
  }

  static ThemeData _base(
    ColorScheme scheme,
    AppPalette palette,
    double radio, {
    bool sinTransiciones = false,
  }) {
    final text = palette.text;
    final border = palette.border;
    final surface = palette.surface;

    // Cada radio de AppSpacing multiplicado por el factor de la preferencia
    // de esquinas (0.4 rectas, 1.0 suaves, 1.4 redondeadas). AppSpacing sigue
    // fijando las constantes: lo único que cambia aquí es la forma de los
    // componentes que Flutter arma desde el `ThemeData` — tarjetas, campos,
    // botones, hojas y diálogos —, no ningún valor `const`.
    double r(double base) => base * radio;

    return ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      extensions: [palette],
      // «Reducir movimiento» tiene que apagar algo visible. `disableAnimations`
      // en el MediaQuery no lo hace solo —Flutter no lo propaga a las rutas—,
      // así que las transiciones de página se quitan aquí, que es de donde las
      // lee GoRouter para todas sus `GoRoute(builder:)`.
      pageTransitionsTheme: sinTransiciones
          ? const PageTransitionsTheme(
              builders: {
                TargetPlatform.android: _SinTransicion(),
                TargetPlatform.iOS: _SinTransicion(),
                TargetPlatform.linux: _SinTransicion(),
                TargetPlatform.macOS: _SinTransicion(),
                TargetPlatform.windows: _SinTransicion(),
                TargetPlatform.fuchsia: _SinTransicion(),
              },
            )
          : null,
      scaffoldBackgroundColor: palette.bg,
      // Inter va empaquetada; Roboto es el respaldo declarado por DESIGN.md §5
      // y además la fuente del sistema en Android, así que un fallo de carga
      // degrada a algo previsible en vez de a la fuente genérica del motor.
      fontFamily: 'Inter',
      fontFamilyFallback: const ['Roboto'],
      textTheme: AppType.textTheme.apply(bodyColor: text, displayColor: text),
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
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 14,
          vertical: 12,
        ),
        hintStyle: AppType.body.copyWith(color: palette.subtle),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(r(AppSpacing.radiusInput)),
          borderSide: BorderSide(color: border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(r(AppSpacing.radiusInput)),
          borderSide: BorderSide(color: border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(r(AppSpacing.radiusInput)),
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
            borderRadius: BorderRadius.circular(r(AppSpacing.radiusInput)),
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
            borderRadius: BorderRadius.circular(r(AppSpacing.radiusInput)),
          ),
          textStyle: AppType.bodyStrong,
        ),
      ),
      navigationRailTheme: NavigationRailThemeData(
        backgroundColor: surface,
        indicatorColor: palette.primarySoft,
        selectedIconTheme: IconThemeData(color: scheme.primary),
        selectedLabelTextStyle: AppType.captionStrong.copyWith(
          color: scheme.primary,
        ),
        unselectedIconTheme: IconThemeData(color: palette.muted),
        unselectedLabelTextStyle: AppType.caption.copyWith(
          color: palette.muted,
        ),
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
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(
            top: Radius.circular(r(AppSpacing.radiusLarge)),
          ),
        ),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: surface,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(r(AppSpacing.radiusCard)),
        ),
        titleTextStyle: AppType.bodyStrong.copyWith(
          color: text,
          fontWeight: FontWeight.w700,
        ),
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
          borderRadius: BorderRadius.circular(r(AppSpacing.radiusInput)),
        ),
      ),
      chipTheme: ChipThemeData(
        labelStyle: AppType.captionStrong,
        backgroundColor: palette.surfaceAlt,
        side: BorderSide(color: border),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(r(AppSpacing.radiusPill)),
        ),
      ),
      cardTheme: CardThemeData(
        color: surface,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(r(AppSpacing.radiusCard)),
          side: BorderSide(color: border),
        ),
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor: palette.isDark ? palette.surfaceAlt : palette.text,
        contentTextStyle: AppType.body.copyWith(
          color: palette.isDark ? palette.text : Colors.white,
        ),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(r(AppSpacing.radiusInput)),
        ),
      ),
    );
  }
}

/// Transición de página que no anima: la ruta nueva aparece en su sitio.
class _SinTransicion extends PageTransitionsBuilder {
  const _SinTransicion();

  @override
  Widget buildTransitions<T>(
    PageRoute<T> route,
    BuildContext context,
    Animation<double> animation,
    Animation<double> secondaryAnimation,
    Widget child,
  ) => child;
}
