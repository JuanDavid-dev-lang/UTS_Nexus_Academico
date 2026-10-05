/**
 * Conectividad: cuándo creer que hay servidor.
 *
 * `navigator.onLine` solo sabe si hay un adaptador de red, no si el servidor
 * contesta: una wifi de aula sin salida a internet es «en línea» para él. Así
 * que la señal buena es la que sale de hablar con el servidor de verdad; el
 * navegador solo vale cuando dice NO.
 */

/**
 * ¿Esta respuesta HTTP prueba que el servidor está ahí?
 *
 * Un 500 sí —la aplicación contestó—, pero 502/503/504 y los 52x de Cloudflare
 * los pone lo que está DELANTE del servidor cuando este no responde: el túnel
 * en pie con el origen caído se ve exactamente así.
 */
export function respuestaProbarServidor(status: number): boolean {
  if (status === 502 || status === 503 || status === 504) return false;
  if (status >= 520 && status <= 530) return false;
  return true;
}

/** Espera entre sondeos mientras no hay conexión: 3 s, 6 s, 12 s… hasta 30 s. */
export function esperaDeSondeo(intento: number): number {
  return Math.min(3_000 * 2 ** Math.max(0, intento), 30_000);
}
