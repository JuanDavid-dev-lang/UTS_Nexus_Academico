/**
 * Typed application errors.
 *
 * The old client wrapped everything in `except Exception` and printed the raw
 * string to the user - a stack trace is not an error message. Here every
 * failure carries a kind the UI can branch on and a message a teacher can
 * actually act on.
 */

export type AppErrorKind =
  | 'network' // Server unreachable
  | 'timeout' // Server too slow
  | 'unauthorized' // 401 - session expired or invalid
  | 'forbidden' // 403 - authenticated but not allowed
  | 'not_found' // 404
  | 'validation' // 400/422 - bad input
  | 'conflict' // 409
  | 'rate_limited' // 429
  | 'server' // 5xx
  | 'contract' // Response did not match the expected schema
  | 'unknown';

export class AppError extends Error {
  readonly kind: AppErrorKind;
  readonly status?: number;
  readonly details?: unknown;

  constructor(kind: AppErrorKind, message: string, status?: number, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.kind = kind;
    this.status = status;
    this.details = details;
  }

  /** True when retrying the exact same request could plausibly succeed. */
  get isRetryable(): boolean {
    return this.kind === 'network' || this.kind === 'timeout' || this.kind === 'server';
  }
}

const MESSAGES: Record<AppErrorKind, string> = {
  network: 'No hay conexión con el servidor. Verifica que esté encendido.',
  timeout: 'El servidor tardó demasiado en responder.',
  unauthorized: 'Tu sesión expiró. Vuelve a iniciar sesión.',
  forbidden: 'No tienes permisos para realizar esta acción.',
  not_found: 'No encontramos lo que buscabas.',
  validation: 'Revisa los datos ingresados: hay algo que no es válido.',
  conflict: 'Ese registro ya existe.',
  rate_limited: 'Demasiadas solicitudes seguidas. Espera un momento.',
  server: 'El servidor tuvo un problema. Intenta de nuevo en unos segundos.',
  contract: 'El servidor respondió en un formato inesperado.',
  unknown: 'Ocurrió un problema inesperado.',
};

export function kindFromStatus(status: number): AppErrorKind {
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 409) return 'conflict';
  if (status === 429) return 'rate_limited';
  if (status === 400 || status === 422) return 'validation';
  if (status >= 500) return 'server';
  return 'unknown';
}

/**
 * Status codes whose `message` is written FOR the user.
 *
 * Everything else - 401, 403, 5xx - carries internal detail. A Mongoose
 * timeout ("Operation `usuarios.findOne()` buffering timed out after
 * 10000ms") is a perfectly accurate message and a completely useless one to
 * show a teacher trying to log in. It is kept in `details` for diagnosis, not
 * put on screen.
 */
const USER_FACING_STATUSES = new Set([400, 409, 422]);

/**
 * Estados de una solicitud de registro que el servidor devuelve con un 403.
 *
 * El 403 queda fuera de la lista de arriba por una razón que sigue siendo
 * buena: un `requireRole` responde 403 con texto interno. Pero el login
 * responde 403 TAMBIÉN cuando la cuenta existe y su registro está en revisión
 * o rechazado, y ahí el texto está escrito para la persona —incluye el motivo
 * que la administración tecleó—. Descartarlo dejaba al docente pendiente
 * leyendo «No tienes permisos para realizar esta acción», que parece una
 * avería, y perdía entero el motivo del rechazo que el panel de
 * administración promete que verá al intentar entrar.
 *
 * El campo `estado` es la marca de que ese 403 lo escribimos nosotros; sin él
 * el mensaje se sigue descartando.
 */
const ESTADOS_DE_REGISTRO = new Set(['PENDIENTE', 'RECHAZADO']);

/** Tope del texto del servidor. El motivo del rechazo llega hasta 300. */
const MAX_MENSAJE = 400;

function estadoDeRegistro(status: number, body: unknown): boolean {
  return (
    status === 403 &&
    !!body &&
    typeof body === 'object' &&
    'estado' in body &&
    typeof body.estado === 'string' &&
    ESTADOS_DE_REGISTRO.has(body.estado)
  );
}

/** Builds an AppError, using the server's message only when it is meant for the user. */
export function appErrorFromResponse(status: number, body: unknown): AppError {
  const kind = kindFromStatus(status);
  const serverMessage =
    body && typeof body === 'object' && 'message' in body && typeof body.message === 'string'
      ? body.message.trim()
      : null;

  // Even on a user-facing status, reject internal-looking strings: backticks
  // and code identifiers mean it came from a library, not from our API.
  const looksInternal =
    !serverMessage ||
    serverMessage.length > 200 ||
    /[`_]|\w+\(\)|\bError\b|\bException\b/.test(serverMessage);

  // El estado del registro identifica un 403 nuestro, así que su texto no pasa
  // por la heurística de arriba: el motivo del rechazo es texto libre y un
  // guion bajo o la palabra «Error» dentro lo habría tumbado al genérico.
  const message =
    serverMessage && estadoDeRegistro(status, body)
      ? serverMessage.slice(0, MAX_MENSAJE)
      : USER_FACING_STATUSES.has(status) && !looksInternal
        ? serverMessage
        : MESSAGES[kind];

  return new AppError(kind, message, status, body);
}

/** Normalises any thrown value into an AppError. Never throws itself. */
export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;

  if (error instanceof DOMException && error.name === 'TimeoutError') {
    return new AppError('timeout', MESSAGES.timeout);
  }
  if (error instanceof DOMException && error.name === 'AbortError') {
    return new AppError('timeout', MESSAGES.timeout);
  }
  if (error instanceof TypeError) {
    // fetch() rejects with TypeError when the host is unreachable.
    return new AppError('network', MESSAGES.network);
  }
  if (error instanceof Error) {
    return new AppError('unknown', error.message || MESSAGES.unknown);
  }
  return new AppError('unknown', MESSAGES.unknown);
}

export function messageFor(kind: AppErrorKind): string {
  return MESSAGES[kind];
}
