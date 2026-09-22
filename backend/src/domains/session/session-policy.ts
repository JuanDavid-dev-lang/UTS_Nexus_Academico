/**
 * Cuánto dura una sesión y a qué equipo queda atada.
 *
 * Una sesión vive **15 días desde el último uso**: cada renovación
 * (`POST /auth/refresh`) empieza otros 15. Mientras la aplicación esté abierta
 * —también en la bandeja— se renueva una vez al día, así que solo caduca quien
 * la cierra y no vuelve en dos semanas. Eso es lo que se pidió: cerrar la
 * aplicación no obliga a entrar de nuevo, un equipo abandonado sí.
 *
 * **Atada al equipo.** El cliente que manda `deviceId` al iniciar sesión tiene
 * que mandar el mismo en cada renovación. Se guarda su hash, no el valor: la
 * colección de sesiones no debería bastar para suplantar un equipo. Un refresh
 * token copiado a otra máquina —un log, una copia de seguridad, un portátil
 * prestado— llega sin ese identificador, o con otro, y no renueva nada.
 *
 * Las sesiones sin `deviceId` (el móvil y los escritorios anteriores a esto)
 * siguen funcionando igual: exigirlo a quien nunca lo mandó cerraría la sesión
 * de todos los teléfonos instalados en la próxima renovación.
 */

/** Días que dura una sesión sin usarse. */
export const DIAS_DE_SESION = 15;

/**
 * Formato aceptado para el identificador del equipo: lo genera el cliente
 * (`crypto.randomUUID()` y similares), así que basta con acotarlo. Menos de 16
 * caracteres no es un identificador aleatorio, y sin tope es una puerta a
 * guardar lo que sea.
 */
export const PATRON_ID_DISPOSITIVO = /^[A-Za-z0-9_-]{16,128}$/;

/**
 * ¿Puede renovarse una sesión guardada con `hashGuardado` desde el equipo que
 * presenta `hashRecibido`?
 *
 * - Sesión sin equipo (anterior a esto, o de un cliente que no lo manda): sí.
 * - Sesión con equipo: solo si el que llega es el mismo. No mandar ninguno
 *   cuenta como otro equipo; si no, bastaría con omitir el campo.
 */
export function dispositivoAutorizado(
  hashGuardado: string | null | undefined,
  hashRecibido: string | null | undefined,
): boolean {
  if (!hashGuardado) return true;
  return hashGuardado === hashRecibido;
}
