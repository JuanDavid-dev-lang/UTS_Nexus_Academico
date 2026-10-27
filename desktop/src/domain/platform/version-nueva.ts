/**
 * Una pestaña abierta antes de un despliegue y una versión nueva publicada.
 *
 * La web se redespliega en cada push a `main` y cada pantalla es un trozo
 * aparte (`lazy` en `router.tsx`) con un hash en el nombre. Una pestaña —o la
 * web instalada en el teléfono— que cargó el `index.html` anterior sigue
 * pidiendo los trozos de esa versión, que ya no existen: al abrir una pantalla
 * que aún no había visitado, el `import()` falla y la persona ve «La aplicación
 * encontró un problema» con un mensaje en inglés que no le dice nada. Recargar
 * trae el `index.html` nuevo y lo arregla, así que se hace sola.
 *
 * El freno (`ESPERA_ENTRE_RECARGAS_MS`) impide un bucle: si tras recargar el
 * trozo sigue sin llegar, el fallo es otro (sin red, despliegue a medias) y lo
 * correcto es enseñarlo, no recargar para siempre.
 */

export const ESPERA_ENTRE_RECARGAS_MS = 60_000;

// Chromium, Firefox, Safari y el envoltorio de Vite, en ese orden.
const MENSAJES_DE_TROZO_PERDIDO = [
  /failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /importing a module script failed/i,
  /unable to preload css/i,
  /expected a javascript.*module script/i,
];

export function esFalloDeCargaDeModulo(error: unknown): boolean {
  const mensaje =
    error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  return MENSAJES_DE_TROZO_PERDIDO.some((patron) => patron.test(mensaje));
}

/** `ultimaRecarga` es el instante (ms) de la recarga anterior, o `null` si no hubo. */
export function debeRecargar(ultimaRecarga: number | null, ahora: number): boolean {
  if (ultimaRecarga === null || !Number.isFinite(ultimaRecarga)) return true;
  return ahora - ultimaRecarga >= ESPERA_ENTRE_RECARGAS_MS;
}
