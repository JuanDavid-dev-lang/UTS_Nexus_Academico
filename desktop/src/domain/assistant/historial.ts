/**
 * Turnos de conversación que se envían con cada pregunta al asistente.
 *
 * Es el tope que valida el backend (`history` en `ai.routes.ts`). Mandarlo
 * entero no era una ineficiencia: en la pregunta 11 el historial pasaba de 20
 * mensajes, Zod lo rechazaba y **el chat dejaba de responder** con un error de
 * validación que no mencionaba el historial. El servicio solo usa los últimos
 * seis turnos de todas formas.
 */
export const TOPE_HISTORIAL = 20;

/**
 * Recorta el historial a lo que el backend acepta, conservando los mensajes
 * **más recientes**.
 *
 * Se queda con el final y no con el principio porque lo que da contexto a la
 * pregunta que se está haciendo es lo último que se dijo, no cómo empezó la
 * conversación hace media hora.
 */
export function historialParaEnviar<T>(mensajes: readonly T[]): T[] {
  return mensajes.slice(-TOPE_HISTORIAL);
}
