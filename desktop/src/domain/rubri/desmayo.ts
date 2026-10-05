/**
 * Easter egg del acceso: a Rubri se le puede tocar, pero no tanto. Con cada
 * toque reacciona un poco más y al decimoquinto se desmaya; al rato se
 * levanta solo. Una pausa larga entre toques lo deja como nuevo: lo que lo
 * marea es la insistencia, no el total del día.
 */
export const TOQUES_PARA_DESMAYO = 15;
export const PAUSA_QUE_REINICIA_MS = 3_000;
export const DURACION_DESMAYO_MS = 5_000;

export type FaseRubri = 'normal' | 'molesto' | 'mareado' | 'desmayado';

export interface ConteoDeToques {
  toques: number;
  ultimo: number | null;
}

export const SIN_TOQUES: ConteoDeToques = { toques: 0, ultimo: null };

/** Suma un toque, o empieza de cero si el anterior fue hace demasiado. */
export function registrarToque(conteo: ConteoDeToques, ahora: number): ConteoDeToques {
  const seguido = conteo.ultimo !== null && ahora - conteo.ultimo <= PAUSA_QUE_REINICIA_MS;
  const base = seguido ? conteo.toques : 0;
  return { toques: Math.min(base + 1, TOQUES_PARA_DESMAYO), ultimo: ahora };
}

export function faseDe(toques: number): FaseRubri {
  if (toques >= TOQUES_PARA_DESMAYO) return 'desmayado';
  if (toques >= 11) return 'mareado';
  if (toques >= 6) return 'molesto';
  return 'normal';
}
