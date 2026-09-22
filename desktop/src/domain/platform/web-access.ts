import type { Role } from '@/domain/schemas/common';

/**
 * Qué pantallas ofrece la versión web.
 *
 * La web es este mismo cliente servido en un navegador, con menos funciones:
 * lo del día a día del aula. Lo demás queda para la aplicación instalada, que
 * es a la que se invita a pasar. ADMIN no tiene recorte.
 *
 * El servidor corta lo mismo por su lado (`backend/src/domains/scope/web-access.ts`):
 * esto evita ofrecer pantallas que iban a responder «solo en la app», no es la
 * defensa.
 */
export const RUTAS_WEB = [
  '/materias',
  '/estudiantes',
  '/notas',
  '/asistencia',
  '/riesgo',
  '/asistente',
  '/sugerencias',
  '/configuracion',
] as const;

/** Donde entra la web: el panel no está en ella. */
export const INICIO_WEB = '/materias';

/**
 * El asistente aparece en el menú de la web, pero como invitación: explica que
 * funciona con machine learning y que completo está en la aplicación.
 */
export const RUTA_ASISTENTE = '/asistente';

/** Página pública de descargas (Windows, Linux, Android y esta misma web). */
export const URL_DESCARGAS = 'https://utsnexus.ciaiuts.com';

/** ¿Hay recorte para este rol en este cliente? */
export function hayRecorteWeb(esWeb: boolean, rol: Role | undefined): boolean {
  return esWeb && rol !== 'ADMIN';
}

/** ¿Se ofrece esta ruta? `ruta` es el `pathname` sin la base de la web. */
export function rutaEnWeb(ruta: string, esWeb: boolean, rol: Role | undefined): boolean {
  if (!hayRecorteWeb(esWeb, rol)) return true;
  return RUTAS_WEB.some((base) => ruta === base || ruta.startsWith(`${base}/`));
}
