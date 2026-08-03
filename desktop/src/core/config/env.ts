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
