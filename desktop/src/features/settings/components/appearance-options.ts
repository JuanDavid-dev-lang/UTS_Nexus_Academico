/**
 * Textos de las opciones de apariencia. Solo presentación: qué colores produce
 * cada opción lo decide `domain/appearance/`.
 */
import type { Esquinas, TamanoTexto } from '@/domain/appearance/preferences';
import type { Tono, VisionColor } from '@/domain/appearance/palettes';
import type { ThemePreference } from '@/state/theme.store';

type Opcion<T extends string> = {
  value: T;
  label: string;
  description: string;
};

export const OPCIONES_MODO: Opcion<ThemePreference>[] = [
  { value: 'light', label: 'Claro', description: 'Superficies blancas' },
  { value: 'dark', label: 'Oscuro', description: 'Descansa la vista de noche' },
  { value: 'system', label: 'Automático', description: 'Sigue al sistema' },
];

export const OPCIONES_TONO: Opcion<Tono>[] = [
  {
    value: 'institucional',
    label: 'Institucional',
    description: 'Verde UTS y lima',
  },
  { value: 'oceano', label: 'Océano', description: 'Azul profundo' },
  { value: 'amatista', label: 'Amatista', description: 'Violeta' },
  { value: 'orquidea', label: 'Orquídea', description: 'Magenta' },
  { value: 'grafito', label: 'Grafito', description: 'Gris pizarra' },
  {
    value: 'personalizado',
    label: 'Color propio',
    description: 'El que tú elijas',
  },
];

export const OPCIONES_VISION: Opcion<VisionColor>[] = [
  {
    value: 'normal',
    label: 'Sin ajuste',
    description: 'Verde, ámbar, rojo y azul de siempre.',
  },
  {
    value: 'deuteranopia',
    label: 'Deuteranopía',
    description: 'Poca sensibilidad al verde, la más común. Estados en azul, amarillo y naranja.',
  },
  {
    value: 'protanopia',
    label: 'Protanopía',
    description: 'Poca sensibilidad al rojo. Estados en azul, amarillo y naranja.',
  },
  {
    value: 'tritanopia',
    label: 'Tritanopía',
    description: 'Poca sensibilidad al azul. Estados en verde azulado, naranja y rojo.',
  },
  {
    value: 'acromatopsia',
    label: 'Acromatopsia',
    description:
      'Sin percepción del color. Interfaz en grises; los estados se separan por contraste.',
  },
];

export const OPCIONES_ESQUINAS: Opcion<Esquinas>[] = [
  { value: 'rectas', label: 'Rectas', description: 'Aspecto sobrio' },
  { value: 'suaves', label: 'Suaves', description: 'Las de siempre' },
  { value: 'redondeadas', label: 'Redondeadas', description: 'Más amable' },
];

export const OPCIONES_TEXTO: Opcion<TamanoTexto>[] = [
  { value: 'normal', label: 'Normal', description: '16 px' },
  { value: 'grande', label: 'Grande', description: '18 px' },
  { value: 'muy-grande', label: 'Muy grande', description: '20 px' },
];

/** Muestras rápidas para el color propio. Son datos, no tokens de interfaz. */
export const MUESTRAS_COLOR_PROPIO = [
  '#0F766E',
  '#0369A1',
  '#4338CA',
  '#7E22CE',
  '#A21CAF',
  '#BE123C',
  '#C2410C',
  '#A16207',
  '#4D7C0F',
  '#15803D',
  '#475569',
  '#78350F',
];
