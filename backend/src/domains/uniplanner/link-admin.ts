/**
 * Gestión institucional de los enlaces de UniPlanner. Lógica pura, sin I/O.
 *
 * El enlace es **de la persona con su universidad**, no de un curso: un
 * estudiante lo crea una vez con su número de documento de identidad y le
 * sirve para todas sus materias —avisos, asistencia por QR—. Por eso lo
 * gestiona la institución (administración y coordinación) y no el docente de
 * una materia: verificar que es suyo, quitarle el bloqueo del semestre si se
 * equivocó de documento, o asignarle el suyo si lo enlazó otra cuenta.
 *
 * El estudiante lo pide desde su app (`link_requests/{uid}` en Firestore) y la
 * decisión la toma una persona de su universidad con él delante o con su
 * correo institucional: ningún proceso automático distingue a quien reclamó su
 * propio código de quien reclamó el de un compañero.
 */
import { esCodigoValido, esInstitucionValida, normalizarCodigo } from './link-id.js';

/** Lo que cabe en el motivo que escribe el estudiante. Mismo tope que sus reglas. */
export const MOTIVO_MAX = 300;

/**
 * Qué pide el estudiante.
 *
 * - `unlock`: su enlace está fijo el semestre y se equivocó de documento, o
 *   tiene que cambiarlo (por ejemplo, cambió de cuenta).
 * - `claimed`: su documento ya lo tiene otra cuenta y no se puede enlazar.
 *
 * Literales permanentes: los escribe UniPlanner.
 */
export type TipoSolicitud = 'unlock' | 'claimed';

export type AccionSolicitud = 'desbloquear' | 'liberar' | 'asignar' | 'rechazar';

/** El id de un enlace descompuesto, o `null` si no tiene la forma `inst__CODIGO`. */
export function partesDelEnlace(linkId: string): { institucion: string; codigo: string } | null {
  const separador = linkId.indexOf('__');
  if (separador <= 0) return null;
  const institucion = linkId.slice(0, separador);
  const codigo = linkId.slice(separador + 2);
  if (!esInstitucionValida(institucion) || !esCodigoValido(codigo)) return null;
  if (normalizarCodigo(codigo) !== codigo) return null;
  return { institucion, codigo };
}

/**
 * Si quien gestiona puede tocar un enlace de esa institución.
 *
 * `gestionables` es `null` para ADMIN (todas) o la lista de claves de sus
 * instituciones. Un enlace de otra universidad no es asunto de su
 * coordinación, y leerlo ya sería enseñarle quién estudia allí.
 */
export function puedeGestionarInstitucion(gestionables: readonly string[] | null, institucion: string): boolean {
  return gestionables === null || gestionables.includes(institucion);
}

/**
 * Qué se puede hacer con cada solicitud.
 *
 * Desbloquear o liberar solo tiene sentido si el enlace es de quien lo pide:
 * quitarle el bloqueo al de otra cuenta le dejaría cambiarlo a esa otra
 * persona.
 *
 * Si el documento lo tiene **otra** cuenta, lo que procede es **asignárselo a
 * quien lo pide**, no liberarlo. El documento es único y la institución acaba
 * de comprobar de quién es: borrarlo dejaba una carrera en la que la cuenta
 * anterior —que seguía apuntándolo en su perfil— lo volvía a reclamar antes
 * que el dueño, que había recibido «ya puedes enlazarte».
 */
export function accionesDeSolicitud(tipo: TipoSolicitud, enlaceEsDeQuienPide: boolean): AccionSolicitud[] {
  if (enlaceEsDeQuienPide) {
    return tipo === 'unlock' ? ['desbloquear', 'liberar', 'rechazar'] : ['desbloquear', 'rechazar'];
  }
  return ['asignar', 'rechazar'];
}

/**
 * Lo que lee el estudiante en su app cuando se resuelve su solicitud.
 *
 * La nota de quien la resolvió va detrás si la hay: un «rechazada» sin motivo
 * es una puerta cerrada sin explicación.
 */
export function mensajeDeResolucion(accion: AccionSolicitud, nota?: string | null): string {
  const base = {
    desbloquear: 'Tu universidad quitó el bloqueo: ya puedes cambiar o deshacer tu enlace.',
    liberar: 'Tu universidad liberó el documento: ya puedes enlazarte con él.',
    asignar:
      'Tu universidad comprobó que el documento es tuyo y te lo asignó, ya verificado. ' +
      'Vuelve a enlazarte con él desde la pantalla del enlace.',
    rechazar: 'Tu universidad revisó tu solicitud y no la aprobó.',
  }[accion];
  const limpia = String(nota ?? '').trim().slice(0, MOTIVO_MAX);
  return limpia ? `${base} ${limpia}` : base;
}
