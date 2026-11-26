/**
 * Versión vigente del aviso de uso y privacidad.
 *
 * El texto vive en los clientes (y en `docs/USO_Y_PRIVACIDAD.md`); el servidor
 * solo guarda qué versión vio cada persona. **Subir este número vuelve a
 * enseñar el aviso a todo el mundo**, que es lo que corresponde si el texto
 * cambia en algo que importe: quien aceptó una versión no aceptó la siguiente.
 * Los dos clientes llevan la misma constante.
 */
export const AVISO_USO_VERSION = 1;

/** ¿Falta que esta persona vea el aviso vigente? */
export function avisoUsoPendiente(vistoEn: Date | null | undefined, version: number | null | undefined): boolean {
  if (!vistoEn) return true;
  return (version ?? 0) < AVISO_USO_VERSION;
}
