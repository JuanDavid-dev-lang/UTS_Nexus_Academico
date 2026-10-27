/**
 * Recarga la página cuando falta un trozo de una versión anterior.
 * Por qué y con qué freno: `domain/platform/version-nueva.ts`.
 */
import { debeRecargar, esFalloDeCargaDeModulo } from '@/domain/platform/version-nueva';

const CLAVE = 'nexus.recarga-por-version';

function leerUltimaRecarga(): number | null {
  try {
    const guardado = sessionStorage.getItem(CLAVE);
    return guardado === null ? null : Number(guardado);
  } catch {
    return null;
  }
}

function anotarRecarga(ahora: number): boolean {
  try {
    sessionStorage.setItem(CLAVE, String(ahora));
    return true;
  } catch {
    // Sin dónde anotarla no hay freno: mejor enseñar el error que arriesgar un bucle.
    return false;
  }
}

/** Recarga si `error` es un trozo perdido y no se acaba de recargar. Devuelve si recargó. */
export function recargarSiFaltaVersion(error: unknown): boolean {
  if (!esFalloDeCargaDeModulo(error)) return false;
  const ahora = Date.now();
  if (!debeRecargar(leerUltimaRecarga(), ahora)) return false;
  if (!anotarRecarga(ahora)) return false;
  window.location.reload();
  return true;
}

/**
 * Vite emite `vite:preloadError` cuando falla la carga de un trozo o de su CSS.
 * `preventDefault()` evita que además se lance: la página se va a recargar.
 */
export function iniciarRecargaPorVersionNueva(): void {
  window.addEventListener('vite:preloadError', (evento) => {
    const error = (evento as Event & { payload?: unknown }).payload;
    if (recargarSiFaltaVersion(error ?? 'Failed to fetch dynamically imported module')) {
      evento.preventDefault();
    }
  });
}
