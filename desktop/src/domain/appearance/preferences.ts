/**
 * Preferencias de apariencia y su traducción a la hoja de estilos.
 *
 * Lo que se guarda vive en `localStorage`, y eso es entrada no confiable: una
 * versión anterior, una edición a mano o un valor que ya no existe. Nada llega
 * al documento sin pasar por `normalizarApariencia`, que cae al valor por
 * defecto campo a campo en vez de descartar todo lo guardado.
 */
import { esHexValido, mezclar, normalizarHex, rgbConAlfa } from './color';
import {
  COLOR_PROPIO_POR_DEFECTO,
  pideEscalaDeGrises,
  TONOS,
  tokensDeTono,
  tonosSemanticos,
  VISIONES,
  type ModoResuelto,
  type Tono,
  type VisionColor,
} from './palettes';

export const ESQUINAS = ['rectas', 'suaves', 'redondeadas'] as const;
export type Esquinas = (typeof ESQUINAS)[number];

export const TAMANOS_TEXTO = ['normal', 'grande', 'muy-grande'] as const;
export type TamanoTexto = (typeof TAMANOS_TEXTO)[number];

export type Apariencia = {
  tono: Tono;
  colorPropio: string;
  vision: VisionColor;
  esquinas: Esquinas;
  tamanoTexto: TamanoTexto;
  reducirMovimiento: boolean;
};

export const APARIENCIA_POR_DEFECTO: Apariencia = {
  tono: 'institucional',
  colorPropio: COLOR_PROPIO_POR_DEFECTO,
  vision: 'normal',
  esquinas: 'suaves',
  tamanoTexto: 'normal',
  reducirMovimiento: false,
};

function unoDe<T extends string>(lista: readonly T[], valor: unknown, porDefecto: T): T {
  return typeof valor === 'string' && (lista as readonly string[]).includes(valor)
    ? (valor as T)
    : porDefecto;
}

export function normalizarApariencia(crudo: unknown): Apariencia {
  const d = APARIENCIA_POR_DEFECTO;
  const o = typeof crudo === 'object' && crudo !== null ? (crudo as Record<string, unknown>) : {};
  return {
    tono: unoDe<Tono>([...TONOS, 'personalizado'], o.tono, d.tono),
    colorPropio:
      typeof o.colorPropio === 'string' && esHexValido(o.colorPropio)
        ? normalizarHex(o.colorPropio)
        : d.colorPropio,
    vision: unoDe(VISIONES, o.vision, d.vision),
    esquinas: unoDe(ESQUINAS, o.esquinas, d.esquinas),
    tamanoTexto: unoDe(TAMANOS_TEXTO, o.tamanoTexto, d.tamanoTexto),
    reducirMovimiento: typeof o.reducirMovimiento === 'boolean' ? o.reducirMovimiento : false,
  };
}

/**
 * Propiedades CSS que se escriben en línea sobre `<html>`.
 *
 * Van en línea y no como un `[data-tono]` por tono en tokens.css porque el
 * color propio no se conoce de antemano: con reglas estáticas habría dos
 * caminos para lo mismo. Los compuestos —degradados, cristal, sombra de marca—
 * se rehacen aquí con la misma forma que tienen en tokens.css.
 */
export function variablesCss(apariencia: Apariencia, modo: ModoResuelto): Record<string, string> {
  const t = tokensDeTono(apariencia.tono, modo, apariencia.colorPropio);
  const estados = tonosSemanticos(apariencia.vision, modo);
  const oscuro = modo === 'dark';

  const variables: Record<string, string> = {};
  for (const [nombre, valor] of Object.entries(t)) {
    if (nombre.startsWith('brand-') || nombre === 'veil') continue;
    variables[`--${nombre}`] = valor;
  }
  for (const [estado, { fg, soft, border }] of Object.entries(estados)) {
    variables[`--${estado}`] = fg;
    variables[`--${estado}-soft`] = soft;
    variables[`--${estado}-border`] = border;
  }

  variables['--gradient-brand'] =
    `linear-gradient(135deg, ${t['brand-start']} 0%, ${t['brand-mid']} 55%, ${t['brand-end']} 100%)`;
  variables['--gradient-veil'] =
    `radial-gradient(120% 120% at 85% 0%, ${rgbConAlfa(t.veil, oscuro ? 0.12 : 0.22)} 0%, ${rgbConAlfa(t.veil, 0)} 55%)`;
  variables['--gradient-surface'] = degradadoDeTarjeta(apariencia, modo);
  variables['--glass-bg'] = rgbConAlfa(t.surface, 0.76);
  variables['--glass-border'] = oscuro
    ? rgbConAlfa(t['border-strong'], 0.5)
    : rgbConAlfa(t.border, 0.9);
  variables['--shadow-primary'] = oscuro
    ? `0 1px 2px rgb(0 0 0 / 0.3), 0 8px 20px -6px ${rgbConAlfa(t.primary, 0.22)}`
    : `0 1px 2px ${rgbConAlfa(t.primary, 0.1)}, 0 8px 20px -6px ${rgbConAlfa(t.primary, 0.28)}`;

  return variables;
}

/**
 * El degradado casi invisible de `.surface-card`. Iba fijo en tokens.css
 * (blanco en claro, oliva en oscuro) y pintaba **encima** de `--surface`: con
 * cualquier tono, las tarjetas seguían blancas u oliva y solo cambiaban los
 * botones. El institucional conserva sus valores exactos.
 */
function degradadoDeTarjeta(apariencia: Apariencia, modo: ModoResuelto): string {
  const t = tokensDeTono(apariencia.tono, modo, apariencia.colorPropio);
  let desde: string;
  let hasta: string;
  if (apariencia.tono === 'institucional') {
    [desde, hasta] = modo === 'light' ? ['#FFFFFF', '#FAFBFD'] : ['#363629', '#31312A'];
  } else if (modo === 'light') {
    desde = t.surface;
    hasta = mezclar(t.surface, t['surface-alt'], 0.4);
  } else {
    desde = mezclar(t.surface, t['surface-hover'], 0.3);
    hasta = mezclar(t.surface, t.bg, 0.1);
  }
  return `linear-gradient(180deg, ${desde} 0%, ${hasta} 100%)`;
}

/** Atributos `data-*` de `<html>` que activan las reglas de estilo de tokens.css. */
export function atributosDocumento(apariencia: Apariencia): Record<string, string> {
  return {
    esquinas: apariencia.esquinas,
    texto: apariencia.tamanoTexto,
    movimiento: apariencia.reducirMovimiento ? 'reducido' : 'normal',
    grises: pideEscalaDeGrises(apariencia.vision) ? 'si' : 'no',
  };
}

/**
 * Cambia cada vez que cambia algo que un lienzo tiene que repintar. Los
 * gráficos leen los tokens una vez por dibujo, así que sin esta firma un
 * cambio de tono dejaría las series con el color anterior.
 */
export function firmaVisual(apariencia: Apariencia, modo: ModoResuelto): string {
  return [modo, apariencia.tono, apariencia.colorPropio, apariencia.vision].join('|');
}
