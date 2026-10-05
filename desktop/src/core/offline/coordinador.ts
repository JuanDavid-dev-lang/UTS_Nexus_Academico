/**
 * Pone de acuerdo las piezas del modo sin conexión.
 *
 * La conectividad avisa, la cola envía, la sesión se revalida. Aquí se decide
 * QUÉ dispara el envío: volver el servidor, conectarse el socket, enfocar la
 * ventana y, por si todo lo demás falla, un latido de un minuto. Cada disparo
 * es barato —`drenar` no hace nada si no hay nada pendiente— y por eso sobran
 * en vez de faltar: una cola que espera «el evento justo» se queda dormida con
 * las notas dentro.
 */
import { useConectividad } from '@/state/connectivity.store';
import { useOutbox } from '@/state/outbox.store';
import { useSession } from '@/state/session.store';
import { useSync } from '@/state/sync.store';
import { alRecuperarConexion, iniciarConectividad, sondearAhora } from './conectividad';
import { outbox } from './outbox';
import { programarPrecarga } from './precarga';

const LATIDO_MS = 60_000;

export function iniciarModoSinConexion(): () => void {
  const pararConectividad = iniciarConectividad();

  const pararRecuperacion = alRecuperarConexion(() => {
    void outbox.drenar();
    // Si se abrió sin servidor con el usuario guardado, ahora se comprueba que
    // la sesión sigue siendo válida (un 401 definitivo la termina como siempre).
    void useSession.getState().revalidar().then(() => programarPrecarga());
  });

  const pararSocket = useSync.subscribe((estado, previo) => {
    if (estado.status === 'connected' && previo.status !== 'connected') {
      void outbox.drenar();
      programarPrecarga();
    }
  });

  // Tras entrar (o abrir con el servidor disponible): traer por adelantado lo
  // que hace falta para trabajar sin conexión. `precargar` decide si toca.
  const pararSesion = useSession.subscribe((estado, previo) => {
    if (estado.status === 'authenticated' && previo.status !== 'authenticated') programarPrecarga(5_000);
  });

  const alEnfocar = () => {
    if (useConectividad.getState().online) void outbox.drenar();
    else void sondearAhora();
  };
  window.addEventListener('focus', alEnfocar);

  const latido = window.setInterval(() => {
    if (useOutbox.getState().entradas.length > 0 && useConectividad.getState().online) {
      void outbox.drenar();
    }
  }, LATIDO_MS);

  return () => {
    pararConectividad();
    pararRecuperacion();
    pararSocket();
    pararSesion();
    window.removeEventListener('focus', alEnfocar);
    window.clearInterval(latido);
  };
}
