/**
 * Envío de errores del cliente al backend.
 *
 * Tres reglas, y las tres existen porque un reportador de fallos mal hecho
 * empeora exactamente la situación que pretende diagnosticar:
 *
 *  1. **Deduplica antes de enviar.** Una pantalla que falla en bucle genera el
 *     mismo error cincuenta veces por minuto; mandarlos todos agotaría el cupo
 *     de peticiones del usuario justo cuando la aplicación ya está rota.
 *  2. **Un fallo al reportar no se reporta.** Si el envío falla, se descarta en
 *     silencio. Reintentar sería la forma más rápida de convertir un error en
 *     un bucle infinito de peticiones.
 *  3. **Nunca se manda lo que no hace falta.** Ni cuerpos de peticiones, ni
 *     respuestas, ni datos personales. El backend vuelve a sanear por su
 *     cuenta, pero eso es la segunda barrera, no la primera.
 */
import { telemetryRepository } from '@/infrastructure/repositories/administracion.repository';
import { tokenService } from '@/core/auth/token.service';

type Categoria = 'render' | 'network' | 'runtime' | 'unhandled' | 'promise' | 'otro';

/** Firmas ya enviadas en esta sesión, con el instante del último envío. */
const enviadas = new Map<string, number>();

/** Ventana de silencio por firma. Cinco minutos: el defecto no cambia antes. */
const VENTANA_MS = 5 * 60_000;

/** Tope de firmas distintas por sesión. Sin él, un error con id dentro del
 * mensaje generaría una firma nueva por ocurrencia y el mapa crecería sin fin. */
const TOPE_FIRMAS = 50;

let versionApp = '';

/** La fija el arranque cuando conoce la versión del ejecutable. */
export function registrarVersion(version: string): void {
  versionApp = version;
}

/**
 * Firma local, solo para deduplicar antes de enviar.
 *
 * La firma que agrupa de verdad la calcula el servidor: si la decidiera el
 * cliente, dos versiones de la aplicación agruparían distinto el mismo defecto.
 */
function firmaLocal(categoria: string, ruta: string, mensaje: string): string {
  return `${categoria}|${ruta}|${mensaje.slice(0, 120).replace(/\d+/g, '#')}`;
}

/** Ruta actual sin identificadores: `/estudiantes/64f…` no es otra pantalla. */
function rutaActual(): string {
  return window.location.pathname.replace(/\/[0-9a-f]{24}(?=\/|$)/gi, '/:id').slice(0, 120);
}

/**
 * Reporta un error. No lanza nunca y no devuelve nada útil: quien lo llama
 * está en mitad de un fallo y no puede encargarse de este.
 */
export function reportarError(
  causa: unknown,
  opciones: { categoria?: Categoria; contexto?: string } = {},
): void {
  // Sin sesión no hay a quién atribuirlo y el endpoint exige autenticación.
  // Un error en la pantalla de login se queda en la consola, que es donde se
  // diagnostica de todas formas.
  if (!tokenService.getAccessToken()) return;

  const categoria = opciones.categoria ?? 'runtime';
  const mensaje =
    causa instanceof Error ? causa.message : typeof causa === 'string' ? causa : 'Error desconocido';
  if (!mensaje) return;

  const ruta = rutaActual();
  const firma = firmaLocal(categoria, ruta, mensaje);

  const ahora = Date.now();
  const ultimo = enviadas.get(firma);
  if (ultimo && ahora - ultimo < VENTANA_MS) return;

  if (enviadas.size >= TOPE_FIRMAS) enviadas.clear();
  enviadas.set(firma, ahora);

  // La pila se recorta aquí y no en el servidor: las líneas de más abajo son
  // del framework y no dicen nada del defecto.
  const contexto =
    opciones.contexto ??
    (causa instanceof Error && causa.stack ? causa.stack.split('\n').slice(0, 8).join('\n') : '');

  void telemetryRepository
    .reportar({
      client: 'desktop',
      appVersion: versionApp,
      platform: navigator.platform || 'desconocida',
      route: ruta,
      category: categoria,
      message: mensaje,
      context: contexto,
    })
    // Silencio deliberado: reportar el fallo del reportador es un bucle.
    .catch(() => undefined);
}

/**
 * Engancha los errores que nadie captura.
 *
 * `error` cubre las excepciones sueltas y `unhandledrejection` las promesas
 * rechazadas, que en una aplicación con consultas asíncronas son la mayoría.
 * Sin la segunda, el panel mostraría solo la mitad de los defectos reales.
 */
export function iniciarTelemetria(): () => void {
  const alError = (evento: ErrorEvent) => {
    reportarError(evento.error ?? evento.message, { categoria: 'unhandled' });
  };

  const alRechazo = (evento: PromiseRejectionEvent) => {
    reportarError(evento.reason, { categoria: 'promise' });
  };

  window.addEventListener('error', alError);
  window.addEventListener('unhandledrejection', alRechazo);

  return () => {
    window.removeEventListener('error', alError);
    window.removeEventListener('unhandledrejection', alRechazo);
  };
}
