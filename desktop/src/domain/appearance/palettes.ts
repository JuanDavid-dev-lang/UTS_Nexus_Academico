/**
 * Tonos de interfaz y visión del color.
 *
 * Un tono decide los colores de marca e interacción —primario, acento,
 * superficies en oscuro, degradado—. La visión del color decide los cuatro
 * estados semánticos (éxito, advertencia, peligro, información), que son los
 * que llevan significado y los que un daltónico no distingue con la paleta de
 * siempre: en la pantalla de riesgo, «aprobado» verde y «riesgo alto» rojo son
 * el mismo marrón para una persona con deuteranopía.
 *
 * Son dos ejes independientes a propósito: quien necesita los estados
 * adaptados puede querer igualmente el tono azul.
 *
 * El móvil replica este archivo en
 * `flutter_app/lib/core/theme/appearance/palettes.dart` y las dos pruebas fijan
 * las mismas salidas. Cambiar un valor aquí sin cambiarlo allí hace que la
 * misma cuenta vea otro color en el teléfono, y no falla nada.
 */
import { ajustarHastaContraste, hexAHsl, hslAHex, limitar, normalizarHex, type Hsl } from './color';

export type ModoResuelto = 'light' | 'dark';

export const TONOS = ['institucional', 'oceano', 'amatista', 'orquidea', 'grafito'] as const;
export type TonoPredefinido = (typeof TONOS)[number];
export type Tono = TonoPredefinido | 'personalizado';

export const VISIONES = [
  'normal',
  'protanopia',
  'deuteranopia',
  'tritanopia',
  'acromatopsia',
] as const;
export type VisionColor = (typeof VISIONES)[number];

export const SEMILLAS: Record<TonoPredefinido, string> = {
  institucional: '#0B5D3B',
  oceano: '#1D4ED8',
  amatista: '#6D28D9',
  orquidea: '#BE185D',
  grafito: '#334155',
};

/** Color propio inicial: el del primer tono que no es el institucional. */
export const COLOR_PROPIO_POR_DEFECTO = SEMILLAS.oceano;

/** Colores que dependen del tono. Las claves son los nombres de tokens.css. */
export type TokensDeTono = {
  bg: string;
  'bg-subtle': string;
  surface: string;
  'surface-alt': string;
  'surface-hover': string;
  'surface-sunken': string;
  border: string;
  'border-strong': string;
  text: string;
  'text-muted': string;
  'text-subtle': string;
  'text-inverted': string;
  primary: string;
  'primary-hover': string;
  'primary-active': string;
  'primary-soft': string;
  'primary-tint': string;
  'on-primary': string;
  accent: string;
  'accent-strong': string;
  'accent-secondary': string;
  'accent-soft': string;
  'on-accent': string;
  ring: string;
  /** Tres paradas del degradado de marca, de la esquina clara a la oscura. */
  'brand-start': string;
  'brand-mid': string;
  'brand-end': string;
  /** Color del velo radial sobre el degradado de marca. */
  veil: string;
};

/** Superficies neutras del modo claro: iguales en todos los tonos. */
const NEUTRAS_CLARAS = {
  bg: '#F4F6F8',
  'bg-subtle': '#EDF0F4',
  surface: '#FFFFFF',
  'surface-alt': '#F3F5F8',
  'surface-hover': '#E9EDF2',
  'surface-sunken': '#EAEEF3',
  border: '#E3E8EE',
  'border-strong': '#CCD3DD',
  text: '#16202B',
  'text-muted': '#5D6B7A',
  'text-subtle': '#8794A3',
  'text-inverted': '#FFFFFF',
} as const;

/**
 * El institucional no se genera: son los valores afinados a mano de tokens.css
 * (verde y lima en claro, oliva y lima en oscuro). Una prueba fija que coinciden
 * con la hoja de estilos; generarlo desde la semilla daría otro verde.
 */
const INSTITUCIONAL: Record<ModoResuelto, TokensDeTono> = {
  light: {
    ...NEUTRAS_CLARAS,
    primary: '#0B5D3B',
    'primary-hover': '#0D6E46',
    'primary-active': '#08472E',
    'primary-soft': '#E8F2EC',
    'primary-tint': '#D2E5DB',
    'on-primary': '#FFFFFF',
    accent: '#CAD225',
    'accent-strong': '#626D0F',
    'accent-secondary': '#8A9615',
    'accent-soft': '#F4F7D9',
    'on-accent': '#1F2937',
    ring: '#0B5D3B',
    'brand-start': '#0D6E46',
    'brand-mid': '#0B5D3B',
    'brand-end': '#08472E',
    veil: '#CAD225',
  },
  dark: {
    bg: '#232922',
    'bg-subtle': '#2B2E26',
    surface: '#33332A',
    'surface-alt': '#37382C',
    'surface-hover': '#3F4033',
    'surface-sunken': '#1E231D',
    border: '#43442F',
    'border-strong': '#696B3E',
    text: '#EDEFDD',
    'text-muted': '#A6AA8A',
    'text-subtle': '#75785F',
    'text-inverted': '#232922',
    primary: '#CAD225',
    'primary-hover': '#D8E04A',
    'primary-active': '#B8C018',
    'primary-soft': '#33371F',
    'primary-tint': '#3F4526',
    'on-primary': '#232922',
    accent: '#CAD225',
    'accent-strong': '#CAD225',
    'accent-secondary': '#999E3C',
    'accent-soft': '#3A3D1C',
    'on-accent': '#232922',
    ring: '#CAD225',
    'brand-start': '#3F4534',
    'brand-mid': '#33332A',
    'brand-end': '#262B21',
    veil: '#CAD225',
  },
};

const BLANCO = '#FFFFFF';
const TINTA_SOBRE_ACENTO = '#1F2937';

function con(base: Hsl, cambios: Partial<Hsl>): Hsl {
  return { ...base, ...cambios };
}

/**
 * Fondos del modo claro teñidos con el tono.
 *
 * Un tono que solo cambiaba botones dejaba la pantalla igual de gris con
 * Océano que con Orquídea: el color se notaba en un 5 % de los píxeles. Aquí
 * el fondo, las tarjetas y los bordes llevan el matiz, pero con la saturación
 * acotada y la luminosidad casi en blanco: sigue habiendo un neutro donde
 * descansar la vista (la lección de tokens.css, «un tinte en todo satura»).
 * El texto también lleva el matiz y se ajusta hasta pasar AA.
 */
function superficiesClaras({ h, s }: Hsl): Pick<TokensDeTono, keyof typeof NEUTRAS_CLARAS> {
  const tinte = Math.min(s, 45);
  const surfaceAlt = hslAHex({ h, s: tinte, l: 96 });
  return {
    bg: hslAHex({ h, s: tinte, l: 94 }),
    'bg-subtle': hslAHex({ h, s: tinte, l: 91 }),
    surface: hslAHex({ h, s: Math.min(s, 60), l: 99 }),
    'surface-alt': surfaceAlt,
    'surface-hover': hslAHex({ h, s: tinte, l: 92 }),
    'surface-sunken': hslAHex({ h, s: tinte, l: 90 }),
    border: hslAHex({ h, s: Math.min(s, 35), l: 87 }),
    'border-strong': hslAHex({ h, s: Math.min(s, 30), l: 78 }),
    text: hslAHex({ h, s: Math.min(s, 40), l: 12 }),
    'text-muted': hslAHex(
      ajustarHastaContraste({ h, s: Math.min(s, 22), l: 42 }, surfaceAlt, 4.5, -1),
    ),
    'text-subtle': hslAHex({ h, s: Math.min(s, 15), l: 58 }),
    'text-inverted': '#FFFFFF',
  };
}

function generarClaro(semilla: Hsl): TokensDeTono {
  const { h, s } = semilla;

  // El primario lleva texto blanco encima y además es texto sobre blanco: 6:1
  // deja margen para que el hover, que es más claro, siga pasando AA.
  const primario = ajustarHastaContraste(
    { h, s: limitar(s, 0, 90), l: Math.min(semilla.l, 40) },
    BLANCO,
    6,
    -1,
  );
  const hover = ajustarHastaContraste(con(primario, { l: primario.l + 4 }), BLANCO, 4.5, -1);
  const activo = con(primario, { l: Math.max(0, primario.l - 6) });
  const acento = ajustarHastaContraste(
    { h, s: limitar(s, 55, 90), l: 62 },
    TINTA_SOBRE_ACENTO,
    4.5,
    1,
  );
  const acentoFuerte = ajustarHastaContraste({ h, s: limitar(s, 40, 90), l: 45 }, BLANCO, 4.5, -1);
  const acentoSecundario = ajustarHastaContraste(
    { h, s: limitar(s, 40, 90), l: 60 },
    BLANCO,
    3,
    -1,
  );
  const inicioMarca = ajustarHastaContraste(con(primario, { l: primario.l + 5 }), BLANCO, 4.5, -1);

  const primarioHex = hslAHex(primario);
  return {
    ...superficiesClaras(semilla),
    primary: primarioHex,
    'primary-hover': hslAHex(hover),
    'primary-active': hslAHex(activo),
    'primary-soft': hslAHex({ h, s: Math.min(s, 60), l: 95 }),
    'primary-tint': hslAHex({ h, s: Math.min(s, 50), l: 89 }),
    'on-primary': BLANCO,
    accent: hslAHex(acento),
    'accent-strong': hslAHex(acentoFuerte),
    'accent-secondary': hslAHex(acentoSecundario),
    'accent-soft': hslAHex({ h, s: Math.min(s, 70), l: 95 }),
    'on-accent': TINTA_SOBRE_ACENTO,
    ring: primarioHex,
    'brand-start': hslAHex(inicioMarca),
    'brand-mid': primarioHex,
    'brand-end': hslAHex(con(primario, { l: Math.max(0, primario.l - 8) })),
    veil: hslAHex(acento),
  };
}

function generarOscuro(semilla: Hsl): TokensDeTono {
  const { h, s } = semilla;
  // Las superficies llevan el tono apagado: lo bastante para que el oscuro se
  // vea azul o violeta de un vistazo, no tanto como para que el texto compita
  // con el fondo.
  const ts = Math.min(s, 24);

  const bg = hslAHex({ h, s: ts, l: 12 });
  const surface = hslAHex({ h, s: ts, l: 17 });
  const surfaceAlt = hslAHex({ h, s: ts, l: 19 });
  const surfaceHover = hslAHex({ h, s: ts, l: 23 });

  // El primario es texto sobre la superficie más clara y relleno con letra del
  // fondo encima: tiene que pasar las dos cosas.
  let primario = ajustarHastaContraste(
    { h, s: limitar(s, 45, 95), l: Math.max(semilla.l, 62) },
    surfaceHover,
    4.5,
    1,
  );
  primario = ajustarHastaContraste(primario, bg, 6, 1);
  const activo = ajustarHastaContraste(con(primario, { l: primario.l - 6 }), bg, 4.5, 1);
  const muted = ajustarHastaContraste({ h, s: Math.min(s, 16), l: 66 }, surfaceAlt, 4.5, 1);
  const acentoSecundario = ajustarHastaContraste({ h, s: Math.min(s, 40), l: 50 }, surface, 3, 1);

  const primarioHex = hslAHex(primario);
  return {
    bg,
    'bg-subtle': hslAHex({ h, s: ts, l: 14 }),
    surface,
    'surface-alt': surfaceAlt,
    'surface-hover': surfaceHover,
    'surface-sunken': hslAHex({ h, s: ts, l: 9 }),
    border: hslAHex({ h, s: ts, l: 26 }),
    'border-strong': hslAHex({ h, s: Math.min(s, 22), l: 38 }),
    text: hslAHex({ h, s: Math.min(s, 30), l: 93 }),
    'text-muted': hslAHex(muted),
    'text-subtle': hslAHex({ h, s: Math.min(s, 12), l: 48 }),
    'text-inverted': bg,
    primary: primarioHex,
    'primary-hover': hslAHex(con(primario, { l: Math.min(100, primario.l + 6) })),
    'primary-active': hslAHex(activo),
    'primary-soft': hslAHex({ h, s: Math.min(s, 35), l: 21 }),
    'primary-tint': hslAHex({ h, s: Math.min(s, 35), l: 26 }),
    'on-primary': bg,
    accent: primarioHex,
    'accent-strong': primarioHex,
    'accent-secondary': hslAHex(acentoSecundario),
    'accent-soft': hslAHex({ h, s: Math.min(s, 40), l: 19 }),
    'on-accent': bg,
    ring: primarioHex,
    'brand-start': hslAHex({ h, s: Math.min(s, 22), l: 25 }),
    'brand-mid': surface,
    'brand-end': hslAHex({ h, s: ts, l: 13 }),
    veil: primarioHex,
  };
}

/** Genera un tono a partir de cualquier color. Es lo que usa «Color propio». */
export function generarTono(semillaHex: string, modo: ModoResuelto): TokensDeTono {
  const semilla = hexAHsl(normalizarHex(semillaHex));
  return modo === 'light' ? generarClaro(semilla) : generarOscuro(semilla);
}

export function tokensDeTono(
  tono: Tono,
  modo: ModoResuelto,
  colorPropio: string = COLOR_PROPIO_POR_DEFECTO,
): TokensDeTono {
  if (tono === 'institucional') return INSTITUCIONAL[modo];
  if (tono === 'personalizado') return generarTono(colorPropio, modo);
  return generarTono(SEMILLAS[tono], modo);
}

/* ------------------------------------------------------------------------ */
/* Visión del color                                                          */
/* ------------------------------------------------------------------------ */

export type Semantico = { fg: string; soft: string; border: string };
export type TonosSemanticos = Record<'success' | 'warning' | 'danger' | 'info', Semantico>;

const NORMAL: Record<ModoResuelto, TonosSemanticos> = {
  light: {
    success: { fg: '#067647', soft: '#ECFDF3', border: '#ABEFC6' },
    warning: { fg: '#B54708', soft: '#FFFAEB', border: '#FEDF89' },
    danger: { fg: '#D92D20', soft: '#FEF3F2', border: '#FECDCA' },
    info: { fg: '#175CD3', soft: '#EFF8FF', border: '#B2DDFF' },
  },
  dark: {
    success: { fg: '#4ADE80', soft: '#1C3B23', border: '#2F5C3A' },
    warning: { fg: '#FBBF24', soft: '#40320F', border: '#6B5518' },
    danger: { fg: '#F87171', soft: '#43201D', border: '#6E332F' },
    info: { fg: '#38BDF8', soft: '#123A44', border: '#1D5C6B' },
  },
};

/**
 * Protanopía y deuteranopía: el eje rojo-verde desaparece.
 *
 * Azul para lo bueno y naranja para lo malo es la pareja que recomiendan
 * Okabe e Ito: se separa por tono y además por luminosidad, así que sigue
 * funcionando con la deficiencia más fuerte. La advertencia va en amarillo
 * —más clara que el naranja— y la información en violeta, lejos del azul.
 */
const ROJO_VERDE: Record<ModoResuelto, TonosSemanticos> = {
  light: {
    success: { fg: '#0B5CAD', soft: '#EAF3FC', border: '#A9CBEF' },
    warning: { fg: '#735400', soft: '#FFF8DB', border: '#EAD27A' },
    danger: { fg: '#B23A00', soft: '#FFF0E6', border: '#F5B990' },
    info: { fg: '#5B3F99', soft: '#F3EFFB', border: '#CDBDEB' },
  },
  dark: {
    success: { fg: '#6CB6FF', soft: '#13304D', border: '#1F4B75' },
    warning: { fg: '#F2D14A', soft: '#3A3210', border: '#6B5A1A' },
    danger: { fg: '#FF9A57', soft: '#43250F', border: '#74401B' },
    info: { fg: '#C3A8FF', soft: '#2C2345', border: '#4A3B73' },
  },
};

/**
 * Tritanopía: el eje azul-amarillo desaparece, el rojo-verde se conserva.
 * Verde azulado para lo bueno, rojo para lo malo, naranja —más claro que el
 * rojo— para la advertencia y un gris azulado neutro para la información, que
 * con azul puro se confundiría con el éxito.
 */
const TRITAN: Record<ModoResuelto, TonosSemanticos> = {
  light: {
    success: { fg: '#00695C', soft: '#E6F5F3', border: '#9ED7CF' },
    warning: { fg: '#A34A06', soft: '#FFF4E8', border: '#F6C79B' },
    danger: { fg: '#C62828', soft: '#FDEEEE', border: '#F2B8B8' },
    info: { fg: '#455A64', soft: '#EEF2F4', border: '#C2CED4' },
  },
  dark: {
    success: { fg: '#4FD1C5', soft: '#10332F', border: '#1C5A53' },
    warning: { fg: '#FDBA74', soft: '#40280F', border: '#6E4719' },
    danger: { fg: '#FF8A8A', soft: '#45191A', border: '#772B2C' },
    info: { fg: '#B0BEC5', soft: '#263238', border: '#3E5059' },
  },
};

/**
 * Acromatopsia: no hay color que valga. Toda la interfaz pasa a escala de
 * grises (lo aplica cada cliente) y los estados se separan por luminosidad —
 * cuanto más grave, más contraste— además de por su etiqueta, que ya llevan.
 */
const ACROMATOPSIA: Record<ModoResuelto, TonosSemanticos> = {
  light: {
    success: { fg: '#4A4A4A', soft: '#F2F2F2', border: '#CFCFCF' },
    warning: { fg: '#2E2E2E', soft: '#E6E6E6', border: '#A8A8A8' },
    danger: { fg: '#000000', soft: '#D6D6D6', border: '#6E6E6E' },
    info: { fg: '#595959', soft: '#F7F7F7', border: '#DCDCDC' },
  },
  dark: {
    success: { fg: '#BDBDBD', soft: '#2A2A2A', border: '#484848' },
    warning: { fg: '#E0E0E0', soft: '#383838', border: '#6A6A6A' },
    danger: { fg: '#FFFFFF', soft: '#4A4A4A', border: '#9A9A9A' },
    info: { fg: '#ADADAD', soft: '#262626', border: '#404040' },
  },
};

export function tonosSemanticos(vision: VisionColor, modo: ModoResuelto): TonosSemanticos {
  switch (vision) {
    case 'protanopia':
    case 'deuteranopia':
      return ROJO_VERDE[modo];
    case 'tritanopia':
      return TRITAN[modo];
    case 'acromatopsia':
      return ACROMATOPSIA[modo];
    default:
      return NORMAL[modo];
  }
}

/** La acromatopsia es la única visión que además pide la interfaz en grises. */
export function pideEscalaDeGrises(vision: VisionColor): boolean {
  return vision === 'acromatopsia';
}
