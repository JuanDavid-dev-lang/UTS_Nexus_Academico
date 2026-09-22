/**
 * Identificador de este equipo para atar la sesión a él.
 *
 * Se genera una vez, al azar, y se guarda en el almacén del sistema (DPAPI en
 * Windows, el llavero en Linux): el mismo sitio que los tokens, que no se
 * copia a otra máquina con solo copiar archivos. El servidor guarda su hash
 * con la sesión y solo deja renovarla a quien presente el mismo
 * (`backend/src/domains/session/session-policy.ts`), así que un refresh token
 * que salga del equipo —un log, una copia de seguridad— no sirve en otro.
 *
 * **No se borra al cerrar sesión.** Es del equipo, no de la sesión: cambiarlo
 * en cada salida no protege nada más y deja en la auditoría un equipo nuevo
 * por cada inicio de sesión.
 */
import { platform } from '@/core/platform/tauri';

const CLAVE = 'device_id';

/** Mismo patrón que acepta el servidor (`PATRON_ID_DISPOSITIVO`). */
const VALIDO = /^[A-Za-z0-9_-]{16,128}$/;

let pendiente: Promise<string> | null = null;

async function leerOCrear(): Promise<string> {
  const guardado = await platform.secureStore.get(CLAVE).catch(() => null);
  if (guardado && VALIDO.test(guardado)) return guardado;

  const nuevo = crypto.randomUUID();
  // Si el almacén falla, el identificador vive lo que dure la ejecución: la
  // sesión funciona, y en el siguiente arranque se pedirá entrar de nuevo, que
  // es lo mismo que ya pasaría con los tokens en ese almacén roto.
  await platform.secureStore.set(CLAVE, nuevo).catch(() => undefined);
  return nuevo;
}

/**
 * El identificador del equipo. Una sola lectura por ejecución: el inicio de
 * sesión y la primera renovación pueden pedirlo a la vez, y dos llamadas en
 * paralelo sin memoria generarían dos identificadores distintos.
 */
export function idDelEquipo(): Promise<string> {
  pendiente ??= leerOCrear().catch((error: unknown) => {
    pendiente = null;
    throw error;
  });
  return pendiente;
}

/** Test seam. */
export function __reiniciarIdDelEquipoParaPruebas(): void {
  pendiente = null;
}
