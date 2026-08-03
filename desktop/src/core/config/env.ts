/**
 * Typed application configuration.
 *
 * The previous client hard-coded `http://127.0.0.1:4000` in four different
 * files, so changing the server meant hunting through the source. Here every
 * value has exactly one definition and is validated at startup: a bad value
 * fails loudly instead of surfacing as a confusing network error later.
 */
import { z } from 'zod';

const schema = z.object({
  /** Root of the API server, without the `/api/v1` suffix. */
  serverUrl: z.string().url(),
  /** Milliseconds before a normal request is aborted. */
  requestTimeoutMs: z.number().int().positive(),
  /** Downloads and AI replies legitimately take longer. */
  longRequestTimeoutMs: z.number().int().positive(),
  appName: z.string().min(1),
  appVersion: z.string().min(1),
});

export type AppConfig = z.infer<typeof schema>;

/**
 * Servidor al que apunta la aplicación recién instalada.
 *
 * Es el de producción, no `localhost`. Antes, cada docente que instalaba el
 * `.exe` se encontraba con una pantalla pidiéndole una dirección IP que no
 * tenía por qué conocer; ahora la app funciona nada más abrirla y el campo
 * sigue existiendo en Configuración para quien necesite otro servidor.
 *
 * Se puede cambiar en tiempo de compilación con `VITE_SERVER_URL`, que es lo
 * que usa el desarrollo local contra `http://127.0.0.1:4000`.
 */
const DEFAULT_SERVER_URL = 'https://3-14-147-55.sslip.io';

/**
 * Direcciones que fueron el valor de fábrica en versiones anteriores.
 *
 * La app guarda el servidor elegido y, al arrancar, ese valor guardado tiene
 * prioridad sobre el de fábrica —lo correcto cuando alguien lo cambió a
 * propósito—. El problema es que las versiones anteriores GRABABAN su propio
 * valor por defecto en el primer arranque, así que quien venía de la 2.0 o la
 * 2.1 se quedaba clavado en `localhost` para siempre: actualizar no cambiaba
 * nada, porque el residuo ganaba siempre y la app reportaba que no encontraba
 * el backend.
 *
 * Si lo guardado coincide con un valor de fábrica antiguo, no fue una decisión
 * de nadie: es un resto, y se descarta en favor del actual. Una dirección que
 * el usuario haya escrito a mano nunca va a estar en esta lista.
 */
const DEFAULTS_SUPERADOS = new Set(['http://127.0.0.1:4000', 'http://localhost:4000']);

/**
 * Servidor con el que arrancar: el guardado, salvo que sea un residuo.
 *
 * Devuelve también si hubo migración, para poder decírselo a la persona en vez
 * de cambiarle la configuración a sus espaldas.
 */
export function resolverServidorInicial(guardado: string | null | undefined): {
  serverUrl: string;
  migrado: boolean;
} {
  if (!guardado) return { serverUrl: DEFAULT_SERVER_URL, migrado: false };

  const normalizado = normalizeServerUrl(guardado);
  if (DEFAULTS_SUPERADOS.has(normalizado) && normalizado !== DEFAULT_SERVER_URL) {
    return { serverUrl: DEFAULT_SERVER_URL, migrado: true };
  }
  return { serverUrl: normalizado, migrado: false };
}

function readEnv(key: string, fallback: string): string {
  const value = import.meta.env[key as keyof ImportMetaEnv];
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

export const env: AppConfig = schema.parse({
  serverUrl: readEnv('VITE_SERVER_URL', DEFAULT_SERVER_URL),
  requestTimeoutMs: Number(readEnv('VITE_REQUEST_TIMEOUT_MS', '20000')),
  longRequestTimeoutMs: Number(readEnv('VITE_LONG_REQUEST_TIMEOUT_MS', '120000')),
  appName: 'UTS Nexus Académico',
  appVersion: readEnv('VITE_APP_VERSION', '2.0.0'),
});

/** Normalises whatever the user typed into a usable API root. */
export function normalizeServerUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (trimmed.length === 0) return DEFAULT_SERVER_URL;
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  return withProtocol.replace(/\/api\/v1$/i, '');
}

export function apiBaseUrl(serverUrl: string): string {
  return `${normalizeServerUrl(serverUrl)}/api/v1`;
}

export { DEFAULT_SERVER_URL };
