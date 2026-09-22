/**
 * HTTP client.
 *
 * Everything the app sends to the API goes through here. Three responsibilities
 * that were missing or scattered in v1:
 *
 *  1. Automatic token refresh on 401, single-flight: ten parallel requests that
 *     all get a 401 trigger exactly ONE refresh, then all ten retry.
 *  2. Runtime validation with zod. A backend change that alters a response shape
 *     surfaces as a clear `contract` error instead of `undefined is not an
 *     object` three components deep.
 *  3. Timeouts on every request, so a hung server never produces a spinner that
 *     spins forever.
 */
import { z, type ZodType, type ZodTypeDef } from 'zod';
import { apiBaseUrl, env } from '@/core/config/env';
import { AppError, appErrorFromResponse, messageFor, toAppError } from '@/core/api/errors';
import { tokenService } from '@/core/auth/token.service';
import { idDelEquipo } from '@/core/auth/device-id';

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

type RequestOptions<T> = {
  method?: Method;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  /**
   * Schema the response must satisfy. Omit only for endpoints returning blobs.
   *
   * The input parameter is `unknown` on purpose: it forces `T` to be inferred
   * from the schema's OUTPUT type, so fields with `.default()` arrive here as
   * required rather than optional.
   */
  schema?: ZodType<T, ZodTypeDef, unknown>;
  timeoutMs?: number;
  /** Skips the Authorization header - used by login and refresh themselves. */
  anonymous?: boolean;
  signal?: AbortSignal;
};

/** Notifies the app that the session is unrecoverable and the user must log in. */
type SessionExpiredListener = () => void;
const sessionExpiredListeners = new Set<SessionExpiredListener>();

export function onSessionExpired(listener: SessionExpiredListener): () => void {
  sessionExpiredListeners.add(listener);
  return () => sessionExpiredListeners.delete(listener);
}

function notifySessionExpired(): void {
  for (const listener of sessionExpiredListeners) listener();
}

let serverUrl = env.serverUrl;

export function setServerUrl(url: string): void {
  serverUrl = url;
}

export function getServerUrl(): string {
  return serverUrl;
}

function buildUrl(path: string, query?: RequestOptions<unknown>['query']): string {
  const url = new URL(`${apiBaseUrl(serverUrl)}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

// ── Single-flight refresh ────────────────────────────────────────────────────
// A shared promise means concurrent 401s wait on one refresh instead of racing
// each other and invalidating one another's rotated refresh token.
//
// Three outcomes, not two. «The server said no» ends the session; «the server
// did not answer» must not. Folding both into `false` logged people out every
// time the app started while the server was stopped or still waking up.
type RefreshOutcome = 'renewed' | 'rejected' | 'unreachable';
let refreshInFlight: Promise<RefreshOutcome> | null = null;

const refreshResponseSchema = z.object({
  ok: z.literal(true),
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
});

async function refreshSession(): Promise<RefreshOutcome> {
  const refreshToken = tokenService.getRefreshToken();
  if (!refreshToken) return 'rejected';

  let response: Response;
  try {
    response = await fetch(buildUrl('/auth/refresh'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // El servidor solo renueva una sesión atada a un equipo si la pide ese
      // mismo equipo (ver `core/auth/device-id.ts`).
      body: JSON.stringify({ refreshToken, deviceId: await idDelEquipo() }),
      signal: AbortSignal.timeout(env.requestTimeoutMs),
    });
  } catch {
    // Unreachable or timed out: nothing is known about the token.
    return 'unreachable';
  }

  // A 5xx or a 429 is the server's trouble, not a verdict on the token.
  if (response.status >= 500 || response.status === 429) return 'unreachable';
  if (!response.ok) return 'rejected';

  const parsed = refreshResponseSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) return 'rejected';

  await tokenService.set({
    accessToken: parsed.data.accessToken,
    refreshToken: parsed.data.refreshToken,
  });
  return 'renewed';
}

function ensureRefresh(): Promise<RefreshOutcome> {
  refreshInFlight ??= refreshSession().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

/**
 * Renews the access token on demand, sharing the same single-flight promise as
 * the 401 path.
 *
 * The socket needs this: socket.io only authenticates during the handshake, so
 * a reconnection attempt made after the access token expired is rejected and
 * real-time sync dies silently. Refreshing here and reconnecting recovers it
 * without racing the HTTP layer's own refresh.
 */
export async function refreshAccessToken(): Promise<boolean> {
  return (await ensureRefresh()) === 'renewed';
}

async function readBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return response.json().catch(() => null);
  }
  return response.text().catch(() => null);
}

async function performRequest(
  path: string,
  options: RequestOptions<unknown>,
  attempt: number,
): Promise<Response> {
  const { method = 'GET', body, query, anonymous, timeoutMs, signal } = options;

  // Un FormData viaja tal cual: el navegador tiene que poner el Content-Type
  // porque incluye el `boundary`, y fijarlo a mano rompe el multipart.
  const esFormulario = body instanceof FormData;

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined && !esFormulario) headers['Content-Type'] = 'application/json';

  if (!anonymous) {
    const accessToken = tokenService.getAccessToken();
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  }

  // Combine the caller's cancellation with our own timeout.
  const timeoutSignal = AbortSignal.timeout(timeoutMs ?? env.requestTimeoutMs);
  const composedSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

  const response = await fetch(buildUrl(path, query), {
    method,
    headers,
    ...(body !== undefined ? { body: esFormulario ? (body as FormData) : JSON.stringify(body) } : {}),
    signal: composedSignal,
  });

  // One refresh + one retry. A second 401 means the refresh token is dead too.
  if (response.status === 401 && !anonymous && attempt === 0) {
    const outcome = await ensureRefresh();
    if (outcome === 'renewed') return performRequest(path, options, attempt + 1);
    // The refresh never reached the server: the session may be perfectly
    // valid, so it is kept and the caller sees a connection error instead.
    if (outcome === 'unreachable') throw new AppError('network', messageFor('network'));

    await tokenService.clear();
    notifySessionExpired();
  }

  return response;
}

export async function request<T>(path: string, options: RequestOptions<T> = {}): Promise<T> {
  let response: Response;
  try {
    response = await performRequest(path, options as RequestOptions<unknown>, 0);
  } catch (error) {
    throw toAppError(error);
  }

  if (!response.ok) {
    throw appErrorFromResponse(response.status, await readBody(response));
  }

  const payload = await readBody(response);

  if (!options.schema) return payload as T;

  const parsed = options.schema.safeParse(payload);
  if (!parsed.success) {
    throw new AppError(
      'contract',
      'El servidor respondió en un formato inesperado.',
      response.status,
      parsed.error.issues,
    );
  }
  return parsed.data;
}

/** Downloads a binary payload (PDF / Excel reports). */
export async function requestBlob(
  path: string,
  query?: RequestOptions<unknown>['query'],
): Promise<Blob> {
  let response: Response;
  try {
    response = await performRequest(
      path,
      { query, timeoutMs: env.longRequestTimeoutMs },
      0,
    );
  } catch (error) {
    throw toAppError(error);
  }

  if (!response.ok) {
    throw appErrorFromResponse(response.status, await readBody(response));
  }
  return response.blob();
}

export const http = {
  get: <T>(path: string, options?: Omit<RequestOptions<T>, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: Omit<RequestOptions<T>, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown, options?: Omit<RequestOptions<T>, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'PATCH', body }),
  put: <T>(path: string, body?: unknown, options?: Omit<RequestOptions<T>, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'PUT', body }),
  delete: <T>(path: string, options?: Omit<RequestOptions<T>, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'DELETE' }),
  blob: requestBlob,
};
