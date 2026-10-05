/**
 * Qué hacer con una entrada de la cola según cómo falló su envío.
 *
 * La regla de fondo: **un fallo del servidor o de la red nunca descarta una
 * escritura; un rechazo del servidor sí la detiene, pero a la vista.** Perder
 * una nota en silencio es peor que mostrar un error que alguien tenga que leer.
 */
import type { OutboxKind } from './outbox';

export type ErrorDeEnvio = {
  kind:
    | 'network'
    | 'timeout'
    | 'unauthorized'
    | 'forbidden'
    | 'not_found'
    | 'validation'
    | 'conflict'
    | 'rate_limited'
    | 'server'
    | 'contract'
    | 'unknown';
  status?: number;
  /** `codigo` del JSON de error del servidor (`PERIODO_BLOQUEADO`, `CORTE_BLOQUEADO`…). */
  codigo?: string;
  mensaje: string;
  retryAfterMs?: number;
};

export type Veredicto =
  /** Ya está hecho (o ya no hay nada que hacer): se quita de la cola. */
  | { tipo: 'exito' }
  /**
   * Transitorio: se queda y se reintenta. `red` = no hubo respuesta;
   * `detener` = no tiene sentido seguir con las demás entradas ahora (sin red,
   * o el servidor pidió espera), a diferencia de un 5xx, que puede ser de esta
   * entrada y no de las otras.
   */
  | { tipo: 'reintentar'; red: boolean; detener: boolean; mensaje: string; esperaMs: number }
  /** La sesión no es válida: se detiene el envío y se conserva todo. */
  | { tipo: 'pausar' }
  /** Depende de otra entrada: se reintenta cuando algo más haya subido. */
  | { tipo: 'aplazar'; mensaje: string }
  /** El servidor la rechazó: se conserva, marcada, con su motivo. */
  | { tipo: 'fallida'; mensaje: string };

/** Espera base y techo del backoff. */
const ESPERA_BASE_MS = 2_000;
const ESPERA_MAXIMA_MS = 5 * 60_000;
/** Un 5xx que se repite deja de ser «el servidor está ocupado» y pasa a ser «esta entrada lo rompe». */
export const MAX_INTENTOS_5XX = 8;
/** Un choque de clave única se cura solo al reintentar; si no, es otra cosa. */
export const MAX_INTENTOS_DUPLICADO = 3;

/** Espera exponencial con tope; el `Retry-After` del servidor, si es mayor, manda. */
export function esperaTrasFallo(intentos: number, retryAfterMs?: number): number {
  const exponencial = Math.min(ESPERA_BASE_MS * 2 ** Math.max(0, intentos), ESPERA_MAXIMA_MS);
  return Math.max(exponencial, retryAfterMs ?? 0);
}

export function clasificarFallo(
  error: ErrorDeEnvio,
  contexto: { kind: OutboxKind; intentos: number },
): Veredicto {
  const { kind, status, codigo } = error;
  const espera = esperaTrasFallo(contexto.intentos, error.retryAfterMs);

  // Sin respuesta del servidor: no se sabe nada de la escritura, se reintenta.
  if (kind === 'network' || kind === 'timeout') {
    return { tipo: 'reintentar', red: true, detener: true, mensaje: error.mensaje, esperaMs: espera };
  }

  if (kind === 'rate_limited') {
    return { tipo: 'reintentar', red: false, detener: true, mensaje: error.mensaje, esperaMs: espera };
  }

  if (kind === 'server') {
    if (contexto.intentos + 1 >= MAX_INTENTOS_5XX) {
      return { tipo: 'fallida', mensaje: error.mensaje };
    }
    return { tipo: 'reintentar', red: false, detener: false, mensaje: error.mensaje, esperaMs: espera };
  }

  if (kind === 'unauthorized') return { tipo: 'pausar' };

  // Borrar algo que ya no está es haber llegado adonde se quería.
  if (kind === 'not_found' && contexto.kind === 'grade.delete') return { tipo: 'exito' };

  if (kind === 'conflict' || status === 409) {
    // Un corte se desbloquea al completar el anterior, que puede ir más atrás
    // o más adelante en la misma cola.
    if (codigo === 'CORTE_BLOQUEADO') return { tipo: 'aplazar', mensaje: error.mensaje };
    if (codigo === 'DUPLICADO' && contexto.intentos + 1 < MAX_INTENTOS_DUPLICADO) {
      return { tipo: 'reintentar', red: false, detener: false, mensaje: error.mensaje, esperaMs: espera };
    }
    return { tipo: 'fallida', mensaje: error.mensaje };
  }

  // Cualquier otro 4xx: la petición está mal o no está permitida; reintentarla igual no la arregla.
  return { tipo: 'fallida', mensaje: error.mensaje };
}

/**
 * `Retry-After` puede ser segundos o una fecha HTTP. Devuelve milisegundos de
 * espera, o `undefined` si no dice nada utilizable.
 */
export function parsearRetryAfter(
  valor: string | null | undefined,
  ahora = Date.now(),
): number | undefined {
  if (!valor) return undefined;
  const texto = valor.trim();
  if (/^\d+$/.test(texto)) return Math.min(Number(texto) * 1000, ESPERA_MAXIMA_MS);
  const fecha = Date.parse(texto);
  if (Number.isNaN(fecha)) return undefined;
  return Math.min(Math.max(fecha - ahora, 0), ESPERA_MAXIMA_MS);
}
