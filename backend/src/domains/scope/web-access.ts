/**
 * Qué se puede hacer desde la versión web.
 *
 * La web es el mismo cliente de escritorio servido en un navegador, con menos
 * funciones: materias, estudiantes, notas y asistencia (con sus exportes y la
 * lista por QR), riesgo, sugerencias y configuración. Lo demás —asistente IA,
 * agenda, actividades, avisos, reportes y actas, trabajos de grado,
 * coordinación y las importaciones por foto o archivo— queda para la
 * aplicación instalada. ADMIN no tiene recorte.
 *
 * **Esto no es un permiso.** Lo que cada rol puede ver y tocar lo siguen
 * decidiendo `requireRole`, el alcance y `role-access.ts`; aquí solo se decide
 * por qué canal. Por eso es una lista de lo que se corta y no de lo que pasa:
 * una lista de lo permitido dejaría una pantalla permitida respondiendo 403 el
 * día que su ruta cambie, y eso se ve como una avería, no como un límite.
 */

export type Canal = 'app' | 'web';

/**
 * El canal de una sesión, decidido por el servidor al iniciarla.
 *
 * El `Origin` lo pone el navegador y una página no lo puede cambiar. La app de
 * escritorio llega con los orígenes fijos de Tauri y el móvil no manda
 * ninguno (su cliente HTTP no es un navegador): los dos son `app`. Cualquier
 * otro origen es un navegador, es decir, la web. Un script puede inventar la
 * cabecera, pero un script ya podía llamar a la API sin pasar por ninguna
 * pantalla: lo que esto regula es qué ofrece cada cliente, no quién entra.
 */
export function canalDeOrigen(origen: string | undefined, origenesApp: readonly string[]): Canal {
  if (!origen) return 'app';
  return origenesApp.includes(origen) ? 'app' : 'web';
}

/** Funciones enteras que solo existen en la aplicación. */
const PREFIJOS_SOLO_APP = [
  '/ai',
  '/agenda',
  '/schedules',
  '/activities',
  '/avisos',
  '/trabajos-grado',
  '/coordinacion',
] as const;

/**
 * Importar desde foto, PDF o planilla: pasan por el servicio de visión o por
 * el intérprete de Excel del servidor. Pegar un listado a mano sigue
 * funcionando (`/enrollments/bulk`), y registrar notas o asistencia también.
 */
const ESCANEOS = [
  '/enrollments/import/scan',
  '/grades/import/scan',
  '/attendance/scan',
  '/attendance/scan/confirm',
] as const;

/** De `/reports`, en la web solo quedan los exportes de notas y asistencia. */
const EXPORTE_WEB = /^\/reports\/(pdf|excel)\/(grades|attendance)$/;

function bajo(ruta: string, prefijo: string): boolean {
  return ruta === prefijo || ruta.startsWith(`${prefijo}/`);
}

/**
 * ¿Está fuera de la web esta petición? `ruta` es la de dentro de `/api/v1`,
 * sin la cadena de consulta.
 */
export function soloEnApp(metodo: string, ruta: string): boolean {
  const limpia = ruta.length > 1 ? ruta.replace(/\/+$/, '') : ruta;
  if (PREFIJOS_SOLO_APP.some((prefijo) => bajo(limpia, prefijo))) return true;
  if (metodo.toUpperCase() === 'POST' && (ESCANEOS as readonly string[]).includes(limpia)) return true;
  if (bajo(limpia, '/reports')) return !(metodo.toUpperCase() === 'GET' && EXPORTE_WEB.test(limpia));
  return false;
}

/** Mensaje de la respuesta: lo enseña el cliente tal cual en su aviso. */
export const MENSAJE_SOLO_APP =
  'Esta función está disponible en la aplicación de escritorio. Descárgala para usarla completa.';
