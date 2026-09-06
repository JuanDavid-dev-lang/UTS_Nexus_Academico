import { env } from './env.js';

/**
 * Única puerta hacia el servicio de ML (FastAPI, Python).
 *
 * Existe por el secreto compartido. Las llamadas al servicio estaban repartidas
 * en nueve sitios de seis módulos distintos —predicción, entrenamiento, Rubri y
 * los cuatro escáneres de visión— y añadir la cabecera en cada uno garantiza
 * que la que se añada mañana se olvide. Y una llamada sin cabecera no falla de
 * forma visible cuando el secreto no está configurado: funciona en local,
 * funciona en las pruebas, y solo se cae el día del despliegue.
 *
 * También centraliza el `AbortSignal.timeout`, que es lo que impide que el
 * servicio de ML caído deje peticiones colgadas del hilo de Node.
 */

/** Cabecera que espera `ml_service/app/security.py`. */
const CABECERA_SECRETO = 'X-ML-Secret';

/**
 * Cabeceras del servicio, con el secreto cuando lo hay.
 *
 * Sin `ML_SHARED_SECRET` no manda nada y el servicio tampoco lo exige: es el
 * modo local, para que un `git clone` arranque sin configurar. En cuanto el
 * servicio escucha fuera de la loopback, él mismo se niega a arrancar sin
 * secreto — la comprobación vive allí porque es allí donde se sabe en qué
 * interfaz escucha.
 */
export function cabecerasML(extra: Record<string, string> = {}): Record<string, string> {
  return env.ML_SHARED_SECRET
    ? { ...extra, [CABECERA_SECRETO]: env.ML_SHARED_SECRET }
    : { ...extra };
}

export type PeticionML = Omit<RequestInit, 'signal'> & {
  /** Presupuesto de espera en milisegundos. Obligatorio: no hay valor sensato por defecto. */
  timeoutMs: number;
};

/**
 * `fetch` contra el servicio de ML, con el secreto y el tiempo de espera ya
 * puestos.
 *
 * `path` empieza por `/`. El cuerpo se pasa tal cual, así que sirve igual para
 * JSON —hay que declarar el `Content-Type`— y para un `FormData`, donde
 * **no** se declara: `fetch` compone el `multipart/form-data` con su
 * `boundary`, y ponerlo a mano lo rompe.
 */
export function mlFetch(path: string, init: PeticionML): Promise<Response> {
  const { timeoutMs, headers, ...resto } = init;
  return fetch(`${env.ML_BASE_URL}${path}`, {
    ...resto,
    headers: cabecerasML(headers as Record<string, string> | undefined),
    signal: AbortSignal.timeout(timeoutMs),
  });
}
