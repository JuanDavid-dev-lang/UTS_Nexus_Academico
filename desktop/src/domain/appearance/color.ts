/**
 * Aritmética de color para las paletas: hex ↔ HSL y contraste WCAG.
 *
 * Todo se redondea a enteros —tono en grados, saturación y luminosidad en
 * porcentaje, canales en 0–255— y no es un capricho: el móvil
 * (`flutter_app/lib/core/theme/appearance/color_math.dart`) replica este
 * archivo línea por línea, y con decimales cada lenguaje redondearía distinto y
 * el mismo color propio saldría con otro hex en el teléfono. Las dos pruebas
 * fijan las mismas salidas.
 */

export type Hsl = { h: number; s: number; l: number };

const HEX = /^#?([0-9a-f]{6})$/i;

export function esHexValido(valor: string): boolean {
  return HEX.test(valor.trim());
}

/** `#abc123` o `abc123` → `#ABC123`. Lanza si no es un hex de seis cifras. */
export function normalizarHex(valor: string): string {
  const coincidencia = HEX.exec(valor.trim());
  if (!coincidencia?.[1]) throw new Error(`Color no válido: ${valor}`);
  return `#${coincidencia[1].toUpperCase()}`;
}

export function hexARgb(hex: string): [number, number, number] {
  const limpio = normalizarHex(hex).slice(1);
  return [
    Number.parseInt(limpio.slice(0, 2), 16),
    Number.parseInt(limpio.slice(2, 4), 16),
    Number.parseInt(limpio.slice(4, 6), 16),
  ];
}

export function rgbAHex(r: number, g: number, b: number): string {
  const canal = (valor: number) =>
    Math.max(0, Math.min(255, Math.round(valor)))
      .toString(16)
      .padStart(2, '0');
  return `#${canal(r)}${canal(g)}${canal(b)}`.toUpperCase();
}

export function hexAHsl(hex: string): Hsl {
  const [r, g, b] = hexARgb(hex).map((c) => c / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;

  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  if (h < 0) h += 360;

  return {
    h: Math.round(h) % 360,
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

export function hslAHex({ h, s, l }: Hsl): string {
  const sat = limitar(s, 0, 100) / 100;
  const lum = limitar(l, 0, 100) / 100;
  const c = (1 - Math.abs(2 * lum - 1)) * sat;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));

  let rgb: [number, number, number];
  if (hp < 1) rgb = [c, x, 0];
  else if (hp < 2) rgb = [x, c, 0];
  else if (hp < 3) rgb = [0, c, x];
  else if (hp < 4) rgb = [0, x, c];
  else if (hp < 5) rgb = [x, 0, c];
  else rgb = [c, 0, x];

  const m = lum - c / 2;
  return rgbAHex((rgb[0] + m) * 255, (rgb[1] + m) * 255, (rgb[2] + m) * 255);
}

function canalLineal(canal: number): number {
  const c = canal / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function luminanciaRelativa(hex: string): number {
  const [r, g, b] = hexARgb(hex);
  return 0.2126 * canalLineal(r) + 0.7152 * canalLineal(g) + 0.0722 * canalLineal(b);
}

/** Relación de contraste WCAG 2.x, de 1 a 21. */
export function contraste(a: string, b: string): number {
  const la = luminanciaRelativa(a);
  const lb = luminanciaRelativa(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export function limitar(valor: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, valor));
}

/**
 * Mueve la luminosidad de un paso en paso hasta que el color contraste al menos
 * `minimo` contra `fondo`. `direccion` -1 oscurece, +1 aclara. Si ni el negro ni
 * el blanco llegan, devuelve el extremo: es lo más legible que existe.
 */
export function ajustarHastaContraste(
  base: Hsl,
  fondo: string,
  minimo: number,
  direccion: -1 | 1,
): Hsl {
  let actual = { ...base };
  while (contraste(hslAHex(actual), fondo) < minimo) {
    const siguiente = actual.l + direccion;
    if (siguiente < 0 || siguiente > 100) break;
    actual = { ...actual, l: siguiente };
  }
  return actual;
}

/** `#0B5D3B` + 0.76 → `rgb(11 93 59 / 0.76)`, la forma que usa tokens.css. */
export function rgbConAlfa(hex: string, alfa: number): string {
  const [r, g, b] = hexARgb(hex);
  return `rgb(${r} ${g} ${b} / ${alfa})`;
}

/** Mezcla lineal en sRGB: `t` 0 da `a`, 1 da `b`. */
export function mezclar(a: string, b: string, t: number): string {
  const [ra, ga, ba] = hexARgb(a);
  const [rb, gb, bb] = hexARgb(b);
  return rgbAHex(ra + (rb - ra) * t, ga + (gb - ga) * t, ba + (bb - ba) * t);
}
