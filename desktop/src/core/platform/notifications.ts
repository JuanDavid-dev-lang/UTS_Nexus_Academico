/**
 * Notificaciones nativas del escritorio.
 *
 * Como el resto de `core/platform`, es el único módulo que toca el plugin y
 * degrada a "no se pudo" en el navegador, donde no hay bandeja del sistema que
 * usar. La llamada nunca lanza: que el sistema operativo no acepte una
 * notificación no puede tumbar la pantalla que la pidió.
 *
 * El aviso nativo NO sustituye al centro de notificaciones: es la copia
 * efímera. Lo que queda registrado es la notificación del servidor, que sigue
 * en la bandeja aunque el aviso del sistema ya haya desaparecido.
 */
import { isDesktop } from './tauri';

/** Se resuelve una vez por sesión: el plugin solo existe en la app empaquetada. */
async function notificationApi() {
  return import('@tauri-apps/plugin-notification');
}

let permisoConcedido: boolean | null = null;

/**
 * Pide permiso una sola vez por sesión y recuerda la respuesta.
 *
 * Preguntar en cada notificación provocaría un diálogo del sistema por cada
 * alerta de riesgo, que es la forma más rápida de que alguien lo deniegue para
 * siempre.
 */
export async function asegurarPermisoNotificaciones(): Promise<boolean> {
  if (permisoConcedido !== null) return permisoConcedido;
  if (!isDesktop) {
    permisoConcedido = false;
    return false;
  }

  try {
    const { isPermissionGranted, requestPermission } = await notificationApi();
    let concedido = await isPermissionGranted();
    if (!concedido) {
      concedido = (await requestPermission()) === 'granted';
    }
    permisoConcedido = concedido;
    return concedido;
  } catch {
    // Plugin ausente (build sin la dependencia) o sistema sin soporte.
    permisoConcedido = false;
    return false;
  }
}

export type AvisoNativo = {
  title: string;
  body: string;
};

/** Muestra un aviso del sistema. Devuelve `false` si no se pudo. */
export async function mostrarAvisoNativo(aviso: AvisoNativo): Promise<boolean> {
  if (!(await asegurarPermisoNotificaciones())) return false;

  try {
    const { sendNotification } = await notificationApi();
    sendNotification({ title: aviso.title, body: aviso.body });
    return true;
  } catch {
    return false;
  }
}

/** Reinicia el permiso recordado. Lo usa el cierre de sesión. */
export function olvidarPermisoNotificaciones(): void {
  permisoConcedido = null;
}
