/**
 * Cuándo renovar la sesión aunque nadie haga ninguna petición.
 *
 * La sesión dura 15 días sin uso y cada renovación empieza otros 15 (rotación,
 * ver `POST /auth/refresh` y `domains/session/session-policy.ts` del backend). La renovación normal solo ocurre cuando una
 * petición recibe un 401, así que una aplicación que pasa semanas en la bandeja
 * sin que nadie la abra dejaba caducar la sesión y la próxima vez pedía entrar
 * de nuevo. Renovar una vez al día basta para que eso no pase nunca mientras la
 * aplicación esté abierta, y no carga al servidor: es una petición diaria por
 * equipo.
 */

/** Renovar si el refresh token tiene más de un día. */
export const RENOVAR_TRAS_MS = 24 * 60 * 60 * 1000;

type Carga = { iat?: number; exp?: number };

export function debeRenovarSesion(carga: Carga | null, ahoraMs: number): boolean {
  if (!carga?.iat) return false;
  // Ya caducado: renovarlo fallaría y cerraría la sesión desde aquí, y eso le
  // toca al flujo normal del 401, que lo explica en pantalla.
  if (carga.exp && carga.exp * 1000 <= ahoraMs) return false;
  return ahoraMs - carga.iat * 1000 >= RENOVAR_TRAS_MS;
}
