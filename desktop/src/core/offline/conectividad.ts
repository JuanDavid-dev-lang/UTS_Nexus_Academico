/**
 * Conectividad del modo sin conexión.
 *
 * Quién dice «hay servidor»:
 *  - **sí**: cualquier respuesta HTTP del servidor, o el socket conectado;
 *  - **no**: un fallo de red en una petición, o el navegador diciendo que no hay
 *    adaptador. Un «sí» del navegador no cuenta (ver `domain/offline/conectividad.ts`).
 * Estando sin conexión se sondea `/health` con espera creciente hasta que
 * conteste; es lo único que genera tráfico por su cuenta.
 *
 * El estado se publica en `useConectividad` y, para que TanStack Query pause en
 * vez de fallar, en su `onlineManager`. Se le quita el oído a los eventos
 * `online`/`offline` del navegador: aquí se decide de otra manera.
 */
import { onlineManager } from '@tanstack/react-query';
import { getServerUrl, observarTransporte } from '@/core/api/http-client';
import { platform } from '@/core/platform/tauri';
import { esperaDeSondeo } from '@/domain/offline/conectividad';
import { useConectividad } from '@/state/connectivity.store';
import { useSync } from '@/state/sync.store';

type Escucha = () => void;
const alVolver = new Set<Escucha>();

/** Se llama cada vez que se pasa de «sin conexión» a «con conexión». */
export function alRecuperarConexion(escucha: Escucha): () => void {
  alVolver.add(escucha);
  return () => alVolver.delete(escucha);
}

let temporizadorDeSondeo: ReturnType<typeof setTimeout> | null = null;
let intentoDeSondeo = 0;
let sondeando = false;

function detenerSondeo(): void {
  if (temporizadorDeSondeo) clearTimeout(temporizadorDeSondeo);
  temporizadorDeSondeo = null;
  intentoDeSondeo = 0;
}

export function marcarEnLinea(): void {
  const estaba = useConectividad.getState().online;
  detenerSondeo();
  if (estaba) return;
  useConectividad.getState().setOnline(true);
  for (const escucha of alVolver) escucha();
}

export function marcarSinConexion(): void {
  useConectividad.getState().setOnline(false);
  programarSondeo(esperaDeSondeo(intentoDeSondeo));
}

function programarSondeo(espera: number): void {
  if (temporizadorDeSondeo) return;
  temporizadorDeSondeo = setTimeout(() => {
    temporizadorDeSondeo = null;
    void sondearAhora();
  }, espera);
}

/** Pregunta ya al servidor si está. Solo tiene sentido estando sin conexión. */
export async function sondearAhora(): Promise<boolean> {
  if (useConectividad.getState().online || sondeando) {
    return useConectividad.getState().online;
  }
  sondeando = true;
  const vivo = await platform.backend
    .health(getServerUrl())
    .catch(() => false)
    .finally(() => {
      sondeando = false;
    });

  if (vivo) {
    marcarEnLinea();
    return true;
  }
  intentoDeSondeo += 1;
  programarSondeo(esperaDeSondeo(intentoDeSondeo));
  return false;
}

/** Engancha todas las fuentes. Devuelve la función que las suelta. */
export function iniciarConectividad(): () => void {
  // El `onlineManager` por defecto marca «en línea» al ver el evento `online`
  // del navegador, sin comprobar nada; aquí lo gobierna el almacén.
  onlineManager.setEventListener(() => () => undefined);
  onlineManager.setOnline(useConectividad.getState().online);
  const dejarDeEscucharAlmacen = useConectividad.subscribe((estado, previo) => {
    if (estado.online !== previo.online) onlineManager.setOnline(estado.online);
  });

  observarTransporte({ respuesta: marcarEnLinea, falloDeRed: marcarSinConexion });

  // El socket conectado es la prueba más barata de que el servidor está ahí.
  const dejarDeEscucharSocket = useSync.subscribe((estado, previo) => {
    if (estado.status === 'connected' && previo.status !== 'connected') marcarEnLinea();
  });

  const alPerderRed = () => marcarSinConexion();
  // Volver el adaptador no prueba nada: se comprueba de verdad.
  const alVolverLaRed = () => void sondearAhora();
  window.addEventListener('offline', alPerderRed);
  window.addEventListener('online', alVolverLaRed);

  if (typeof navigator !== 'undefined' && navigator.onLine === false) marcarSinConexion();

  return () => {
    observarTransporte(null);
    dejarDeEscucharAlmacen();
    dejarDeEscucharSocket();
    window.removeEventListener('offline', alPerderRed);
    window.removeEventListener('online', alVolverLaRed);
    detenerSondeo();
  };
}
