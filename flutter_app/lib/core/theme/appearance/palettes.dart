/// Tonos de interfaz y visión del color.
///
/// Un tono decide los colores de marca e interacción —primario, acento,
/// superficies en oscuro, degradado—. La visión del color decide los cuatro
/// estados semánticos (éxito, advertencia, peligro, información), que son los
/// que llevan significado y los que un daltónico no distingue con la paleta
/// de siempre: en la pantalla de riesgo, «aprobado» verde y «riesgo alto»
/// rojo son el mismo marrón para una persona con deuteranopía.
///
/// Son dos ejes independientes a propósito: quien necesita los estados
/// adaptados puede querer igualmente el tono azul.
///
/// Este archivo replica `desktop/src/domain/appearance/palettes.ts` y las
/// pruebas de los dos clientes fijan las mismas salidas. Cambiar un valor
/// aquí sin cambiarlo allí hace que la misma cuenta vea otro color en el
/// escritorio, y no falla nada.
library;

import 'dart:math' as math;

import 'color_math.dart';

enum ModoResuelto { light, dark }

/// Los cinco tonos de fábrica. `Tono.personalizado` es el sexto valor y no
/// tiene semilla propia: usa el hex que la persona eligió.
enum Tono { institucional, oceano, amatista, orquidea, grafito, personalizado }

/// Los cinco tonos de fábrica, en el orden en que se ofrecen.
const List<Tono> tonosPredefinidos = [
  Tono.institucional,
  Tono.oceano,
  Tono.amatista,
  Tono.orquidea,
  Tono.grafito,
];

enum VisionColor { normal, protanopia, deuteranopia, tritanopia, acromatopsia }

const List<VisionColor> visiones = VisionColor.values;

const Map<Tono, String> semillas = {
  Tono.institucional: '#0B5D3B',
  Tono.oceano: '#1D4ED8',
  Tono.amatista: '#6D28D9',
  Tono.orquidea: '#BE185D',
  Tono.grafito: '#334155',
};

/// Color propio inicial: el mismo que [semillas]`[Tono.oceano]` (no se puede
/// leer el mapa en un contexto constante, así que se repite el literal; una
/// prueba fija que coinciden).
const String colorPropioPorDefecto = '#1D4ED8';

/// Colores que dependen del tono. Los nombres son los mismos (en camelCase)
/// que las claves de `tokens.css` en el escritorio.
class TokensDeTono {
  final String bg;
  final String bgSubtle;
  final String surface;
  final String surfaceAlt;
  final String surfaceHover;
  final String surfaceSunken;
  final String border;
  final String borderStrong;
  final String text;
  final String textMuted;
  final String textSubtle;
  final String textInverted;
  final String primary;
  final String primaryHover;
  final String primaryActive;
  final String primarySoft;
  final String primaryTint;
  final String onPrimary;
  final String accent;
  final String accentStrong;
  final String accentSecondary;
  final String accentSoft;
  final String onAccent;
  final String ring;

  /// Tres paradas del degradado de marca, de la esquina clara a la oscura.
  final String brandStart;
  final String brandMid;
  final String brandEnd;

  /// Color del velo radial sobre el degradado de marca.
  final String veil;

  const TokensDeTono({
    required this.bg,
    required this.bgSubtle,
    required this.surface,
    required this.surfaceAlt,
    required this.surfaceHover,
    required this.surfaceSunken,
    required this.border,
    required this.borderStrong,
    required this.text,
    required this.textMuted,
    required this.textSubtle,
    required this.textInverted,
    required this.primary,
    required this.primaryHover,
    required this.primaryActive,
    required this.primarySoft,
    required this.primaryTint,
    required this.onPrimary,
    required this.accent,
    required this.accentStrong,
    required this.accentSecondary,
    required this.accentSoft,
    required this.onAccent,
    required this.ring,
    required this.brandStart,
    required this.brandMid,
    required this.brandEnd,
    required this.veil,
  });
}

/// Superficies neutras del modo claro del tono institucional. Los tonos
/// generados las tiñen (ver `_generarClaro`).
const _bgClaro = '#F4F6F8';
const _bgSubtleClaro = '#EDF0F4';
const _surfaceClaro = '#FFFFFF';
const _surfaceAltClaro = '#F3F5F8';
const _surfaceHoverClaro = '#E9EDF2';
const _surfaceSunkenClaro = '#EAEEF3';
const _borderClaro = '#E3E8EE';
const _borderStrongClaro = '#CCD3DD';
const _textClaro = '#16202B';
const _textMutedClaro = '#5D6B7A';
const _textSubtleClaro = '#8794A3';
const _textInvertedClaro = '#FFFFFF';

const String _blanco = '#FFFFFF';
const String _tintaSobreAcento = '#1F2937';

/// El institucional no se genera: son los valores afinados a mano de
/// `tokens.css` (verde y lima en claro, oliva y lima en oscuro). Una prueba
/// fija que coinciden con las constantes de `AppColors`; generarlo desde la
/// semilla daría otro verde.
final Map<ModoResuelto, TokensDeTono> _institucional = {
  ModoResuelto.light: const TokensDeTono(
    bg: _bgClaro,
    bgSubtle: _bgSubtleClaro,
    surface: _surfaceClaro,
    surfaceAlt: _surfaceAltClaro,
    surfaceHover: _surfaceHoverClaro,
    surfaceSunken: _surfaceSunkenClaro,
    border: _borderClaro,
    borderStrong: _borderStrongClaro,
    text: _textClaro,
    textMuted: _textMutedClaro,
    textSubtle: _textSubtleClaro,
    textInverted: _textInvertedClaro,
    primary: '#0B5D3B',
    primaryHover: '#0D6E46',
    primaryActive: '#08472E',
    primarySoft: '#E8F2EC',
    primaryTint: '#D2E5DB',
    onPrimary: '#FFFFFF',
    accent: '#CAD225',
    accentStrong: '#626D0F',
    accentSecondary: '#8A9615',
    accentSoft: '#F4F7D9',
    onAccent: '#1F2937',
    ring: '#0B5D3B',
    brandStart: '#0D6E46',
    brandMid: '#0B5D3B',
    brandEnd: '#08472E',
    veil: '#CAD225',
  ),
  ModoResuelto.dark: const TokensDeTono(
    bg: '#232922',
    bgSubtle: '#2B2E26',
    surface: '#33332A',
    surfaceAlt: '#37382C',
    surfaceHover: '#3F4033',
    surfaceSunken: '#1E231D',
    border: '#43442F',
    borderStrong: '#696B3E',
    text: '#EDEFDD',
    textMuted: '#A6AA8A',
    textSubtle: '#75785F',
    textInverted: '#232922',
    primary: '#CAD225',
    primaryHover: '#D8E04A',
    primaryActive: '#B8C018',
    primarySoft: '#33371F',
    primaryTint: '#3F4526',
    onPrimary: '#232922',
    accent: '#CAD225',
    accentStrong: '#CAD225',
    accentSecondary: '#999E3C',
    accentSoft: '#3A3D1C',
    onAccent: '#232922',
    ring: '#CAD225',
    brandStart: '#3F4534',
    brandMid: '#33332A',
    brandEnd: '#262B21',
    veil: '#CAD225',
  ),
};

Hsl _con(Hsl base, {int? h, int? s, int? l}) => base.copyWith(h: h, s: s, l: l);

TokensDeTono _generarClaro(Hsl semilla) {
  final h = semilla.h;
  final s = semilla.s;

  // El primario lleva texto blanco encima y además es texto sobre blanco:
  // 6:1 deja margen para que el hover, que es más claro, siga pasando AA.
  final primario = ajustarHastaContraste(
    Hsl(h: h, s: limitar(s, 0, 90).round(), l: math.min(semilla.l, 40)),
    _blanco,
    6,
    -1,
  );
  final hover = ajustarHastaContraste(
    _con(primario, l: primario.l + 4),
    _blanco,
    4.5,
    -1,
  );
  final activo = _con(primario, l: math.max(0, primario.l - 6));
  final acento = ajustarHastaContraste(
    Hsl(h: h, s: limitar(s, 55, 90).round(), l: 62),
    _tintaSobreAcento,
    4.5,
    1,
  );
  final acentoFuerte = ajustarHastaContraste(
    Hsl(h: h, s: limitar(s, 40, 90).round(), l: 45),
    _blanco,
    4.5,
    -1,
  );
  final acentoSecundario = ajustarHastaContraste(
    Hsl(h: h, s: limitar(s, 40, 90).round(), l: 60),
    _blanco,
    3,
    -1,
  );
  final inicioMarca = ajustarHastaContraste(
    _con(primario, l: primario.l + 5),
    _blanco,
    4.5,
    -1,
  );

  // Fondos teñidos con el tono: ver `superficiesClaras` en palettes.ts.
  final tinte = math.min(s, 45);
  final surfaceAlt = hslAHex(Hsl(h: h, s: tinte, l: 96));
  final muted = ajustarHastaContraste(
    Hsl(h: h, s: math.min(s, 22), l: 42),
    surfaceAlt,
    4.5,
    -1,
  );

  final primarioHex = hslAHex(primario);
  return TokensDeTono(
    bg: hslAHex(Hsl(h: h, s: tinte, l: 94)),
    bgSubtle: hslAHex(Hsl(h: h, s: tinte, l: 91)),
    surface: hslAHex(Hsl(h: h, s: math.min(s, 60), l: 99)),
    surfaceAlt: surfaceAlt,
    surfaceHover: hslAHex(Hsl(h: h, s: tinte, l: 92)),
    surfaceSunken: hslAHex(Hsl(h: h, s: tinte, l: 90)),
    border: hslAHex(Hsl(h: h, s: math.min(s, 35), l: 87)),
    borderStrong: hslAHex(Hsl(h: h, s: math.min(s, 30), l: 78)),
    text: hslAHex(Hsl(h: h, s: math.min(s, 40), l: 12)),
    textMuted: hslAHex(muted),
    textSubtle: hslAHex(Hsl(h: h, s: math.min(s, 15), l: 58)),
    textInverted: _blanco,
    primary: primarioHex,
    primaryHover: hslAHex(hover),
    primaryActive: hslAHex(activo),
    primarySoft: hslAHex(Hsl(h: h, s: math.min(s, 60), l: 95)),
    primaryTint: hslAHex(Hsl(h: h, s: math.min(s, 50), l: 89)),
    onPrimary: _blanco,
    accent: hslAHex(acento),
    accentStrong: hslAHex(acentoFuerte),
    accentSecondary: hslAHex(acentoSecundario),
    accentSoft: hslAHex(Hsl(h: h, s: math.min(s, 70), l: 95)),
    onAccent: _tintaSobreAcento,
    ring: primarioHex,
    brandStart: hslAHex(inicioMarca),
    brandMid: primarioHex,
    brandEnd: hslAHex(_con(primario, l: math.max(0, primario.l - 8))),
    veil: hslAHex(acento),
  );
}

TokensDeTono _generarOscuro(Hsl semilla) {
  final h = semilla.h;
  final s = semilla.s;
  // Las superficies llevan el tono muy apagado: lo bastante para que el
  // oscuro «sea» azul o violeta, no tanto como para que el texto compita
  // con el fondo.
  final ts = math.min(s, 24);

  final bg = hslAHex(Hsl(h: h, s: ts, l: 12));
  final surface = hslAHex(Hsl(h: h, s: ts, l: 17));
  final surfaceAlt = hslAHex(Hsl(h: h, s: ts, l: 19));
  final surfaceHover = hslAHex(Hsl(h: h, s: ts, l: 23));

  // El primario es texto sobre la superficie más clara y relleno con letra
  // del fondo encima: tiene que pasar las dos cosas.
  var primario = ajustarHastaContraste(
    Hsl(h: h, s: limitar(s, 45, 95).round(), l: math.max(semilla.l, 62)),
    surfaceHover,
    4.5,
    1,
  );
  primario = ajustarHastaContraste(primario, bg, 6, 1);
  final activo = ajustarHastaContraste(
    _con(primario, l: primario.l - 6),
    bg,
    4.5,
    1,
  );
  final muted = ajustarHastaContraste(
    Hsl(h: h, s: math.min(s, 16), l: 66),
    surfaceAlt,
    4.5,
    1,
  );
  final acentoSecundario = ajustarHastaContraste(
    Hsl(h: h, s: math.min(s, 40), l: 50),
    surface,
    3,
    1,
  );

  final primarioHex = hslAHex(primario);
  return TokensDeTono(
    bg: bg,
    bgSubtle: hslAHex(Hsl(h: h, s: ts, l: 14)),
    surface: surface,
    surfaceAlt: surfaceAlt,
    surfaceHover: surfaceHover,
    surfaceSunken: hslAHex(Hsl(h: h, s: ts, l: 9)),
    border: hslAHex(Hsl(h: h, s: ts, l: 26)),
    borderStrong: hslAHex(Hsl(h: h, s: math.min(s, 22), l: 38)),
    text: hslAHex(Hsl(h: h, s: math.min(s, 30), l: 93)),
    textMuted: hslAHex(muted),
    textSubtle: hslAHex(Hsl(h: h, s: math.min(s, 12), l: 48)),
    textInverted: bg,
    primary: primarioHex,
    primaryHover: hslAHex(_con(primario, l: math.min(100, primario.l + 6))),
    primaryActive: hslAHex(activo),
    primarySoft: hslAHex(Hsl(h: h, s: math.min(s, 35), l: 21)),
    primaryTint: hslAHex(Hsl(h: h, s: math.min(s, 35), l: 26)),
    onPrimary: bg,
    accent: primarioHex,
    accentStrong: primarioHex,
    accentSecondary: hslAHex(acentoSecundario),
    accentSoft: hslAHex(Hsl(h: h, s: math.min(s, 40), l: 19)),
    onAccent: bg,
    ring: primarioHex,
    brandStart: hslAHex(Hsl(h: h, s: math.min(s, 22), l: 25)),
    brandMid: surface,
    brandEnd: hslAHex(Hsl(h: h, s: ts, l: 13)),
    veil: primarioHex,
  );
}

/// Genera un tono a partir de cualquier color. Es lo que usa «Color propio».
TokensDeTono generarTono(String semillaHex, ModoResuelto modo) {
  final semilla = hexAHsl(normalizarHex(semillaHex));
  return modo == ModoResuelto.light
      ? _generarClaro(semilla)
      : _generarOscuro(semilla);
}

TokensDeTono tokensDeTono(
  Tono tono,
  ModoResuelto modo, [
  String colorPropio = colorPropioPorDefecto,
]) {
  if (tono == Tono.institucional) return _institucional[modo]!;
  if (tono == Tono.personalizado) return generarTono(colorPropio, modo);
  return generarTono(semillas[tono]!, modo);
}

/* -------------------------------------------------------------------- */
/* Visión del color                                                      */
/* -------------------------------------------------------------------- */

class Semantico {
  final String fg;
  final String soft;
  final String border;
  const Semantico({required this.fg, required this.soft, required this.border});
}

class TonosSemanticos {
  final Semantico success;
  final Semantico warning;
  final Semantico danger;
  final Semantico info;
  const TonosSemanticos({
    required this.success,
    required this.warning,
    required this.danger,
    required this.info,
  });
}

const Map<ModoResuelto, TonosSemanticos> _normal = {
  ModoResuelto.light: TonosSemanticos(
    success: Semantico(fg: '#067647', soft: '#ECFDF3', border: '#ABEFC6'),
    warning: Semantico(fg: '#B54708', soft: '#FFFAEB', border: '#FEDF89'),
    danger: Semantico(fg: '#D92D20', soft: '#FEF3F2', border: '#FECDCA'),
    info: Semantico(fg: '#175CD3', soft: '#EFF8FF', border: '#B2DDFF'),
  ),
  ModoResuelto.dark: TonosSemanticos(
    success: Semantico(fg: '#4ADE80', soft: '#1C3B23', border: '#2F5C3A'),
    warning: Semantico(fg: '#FBBF24', soft: '#40320F', border: '#6B5518'),
    danger: Semantico(fg: '#F87171', soft: '#43201D', border: '#6E332F'),
    info: Semantico(fg: '#38BDF8', soft: '#123A44', border: '#1D5C6B'),
  ),
};

/// Protanopía y deuteranopía: el eje rojo-verde desaparece.
///
/// Azul para lo bueno y naranja para lo malo es la pareja que recomiendan
/// Okabe e Ito: se separa por tono y además por luminosidad, así que sigue
/// funcionando con la deficiencia más fuerte. La advertencia va en amarillo
/// —más clara que el naranja— y la información en violeta, lejos del azul.
const Map<ModoResuelto, TonosSemanticos> _rojoVerde = {
  ModoResuelto.light: TonosSemanticos(
    success: Semantico(fg: '#0B5CAD', soft: '#EAF3FC', border: '#A9CBEF'),
    warning: Semantico(fg: '#735400', soft: '#FFF8DB', border: '#EAD27A'),
    danger: Semantico(fg: '#B23A00', soft: '#FFF0E6', border: '#F5B990'),
    info: Semantico(fg: '#5B3F99', soft: '#F3EFFB', border: '#CDBDEB'),
  ),
  ModoResuelto.dark: TonosSemanticos(
    success: Semantico(fg: '#6CB6FF', soft: '#13304D', border: '#1F4B75'),
    warning: Semantico(fg: '#F2D14A', soft: '#3A3210', border: '#6B5A1A'),
    danger: Semantico(fg: '#FF9A57', soft: '#43250F', border: '#74401B'),
    info: Semantico(fg: '#C3A8FF', soft: '#2C2345', border: '#4A3B73'),
  ),
};

/// Tritanopía: el eje azul-amarillo desaparece, el rojo-verde se conserva.
/// Verde azulado para lo bueno, rojo para lo malo, naranja —más claro que el
/// rojo— para la advertencia y un gris azulado neutro para la información,
/// que con azul puro se confundiría con el éxito.
const Map<ModoResuelto, TonosSemanticos> _tritan = {
  ModoResuelto.light: TonosSemanticos(
    success: Semantico(fg: '#00695C', soft: '#E6F5F3', border: '#9ED7CF'),
    warning: Semantico(fg: '#A34A06', soft: '#FFF4E8', border: '#F6C79B'),
    danger: Semantico(fg: '#C62828', soft: '#FDEEEE', border: '#F2B8B8'),
    info: Semantico(fg: '#455A64', soft: '#EEF2F4', border: '#C2CED4'),
  ),
  ModoResuelto.dark: TonosSemanticos(
    success: Semantico(fg: '#4FD1C5', soft: '#10332F', border: '#1C5A53'),
    warning: Semantico(fg: '#FDBA74', soft: '#40280F', border: '#6E4719'),
    danger: Semantico(fg: '#FF8A8A', soft: '#45191A', border: '#772B2C'),
    info: Semantico(fg: '#B0BEC5', soft: '#263238', border: '#3E5059'),
  ),
};

/// Acromatopsia: no hay color que valga. Toda la interfaz pasa a escala de
/// grises (lo aplica cada cliente) y los estados se separan por luminosidad
/// —cuanto más grave, más contraste— además de por su etiqueta, que ya
/// llevan.
const Map<ModoResuelto, TonosSemanticos> _acromatopsia = {
  ModoResuelto.light: TonosSemanticos(
    success: Semantico(fg: '#4A4A4A', soft: '#F2F2F2', border: '#CFCFCF'),
    warning: Semantico(fg: '#2E2E2E', soft: '#E6E6E6', border: '#A8A8A8'),
    danger: Semantico(fg: '#000000', soft: '#D6D6D6', border: '#6E6E6E'),
    info: Semantico(fg: '#595959', soft: '#F7F7F7', border: '#DCDCDC'),
  ),
  ModoResuelto.dark: TonosSemanticos(
    success: Semantico(fg: '#BDBDBD', soft: '#2A2A2A', border: '#484848'),
    warning: Semantico(fg: '#E0E0E0', soft: '#383838', border: '#6A6A6A'),
    danger: Semantico(fg: '#FFFFFF', soft: '#4A4A4A', border: '#9A9A9A'),
    info: Semantico(fg: '#ADADAD', soft: '#262626', border: '#404040'),
  ),
};

TonosSemanticos tonosSemanticos(VisionColor vision, ModoResuelto modo) {
  switch (vision) {
    case VisionColor.protanopia:
    case VisionColor.deuteranopia:
      return _rojoVerde[modo]!;
    case VisionColor.tritanopia:
      return _tritan[modo]!;
    case VisionColor.acromatopsia:
      return _acromatopsia[modo]!;
    case VisionColor.normal:
      return _normal[modo]!;
  }
}

/// La acromatopsia es la única visión que además pide la interfaz en grises.
bool pideEscalaDeGrises(VisionColor vision) =>
    vision == VisionColor.acromatopsia;
