import type { ErrorRequestHandler } from 'express';
import { MulterError } from 'multer';
import { ZodError } from 'zod';

/** Nombres de error que lanza `jsonwebtoken` al verificar un token. */
const ERRORES_JWT = new Set(['TokenExpiredError', 'JsonWebTokenError', 'NotBeforeError']);

/** Errores del driver de Mongo que significan «no hay base», no «la consulta está mal». */
const ERRORES_CONEXION_MONGO = new Set([
  'MongoServerSelectionError',
  'MongoNetworkError',
  'MongoNetworkTimeoutError',
  'MongoNotConnectedError',
  'MongoTopologyClosedError',
  'MongoPoolClearedError',
]);

/**
 * Si un error es la base caída o inalcanzable. Con `bufferCommands: false`,
 * Mongoose lanza un `MongooseError` genérico al consultar sin conexión; se
 * reconoce por su mensaje, que es estable entre versiones.
 */
export function esFalloDeConexionConLaBase(err: unknown): boolean {
  const e = err as { name?: string; message?: string } | null;
  if (!e) return false;
  if (e.name && ERRORES_CONEXION_MONGO.has(e.name)) return true;
  return e.name === 'MongooseError' && /before initial connection is complete|bufferCommands = false/i.test(e.message ?? '');
}

/**
 * Traduce un error a una respuesta HTTP.
 *
 * Una entrada inválida es un 400, no un 500. La diferencia no es cosmética: los
 * clientes tratan el 5xx como "el servidor falló, vuelve a intentarlo" y
 * reintentan solos, de modo que una petición mal formada quedaría reintentándose
 * para siempre en vez de mostrarle al usuario qué campo corregir.
 */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    const issue = err.issues[0];
    const field = issue?.path.join('.');
    return res.status(400).json({
      ok: false,
      message: issue
        ? `${field ? `${field}: ` : ''}${issue.message}`
        : 'Datos inválidos.',
      issues: err.issues.map(item => ({ path: item.path.join('.'), message: item.message })),
    });
  }

  // Clave duplicada de Mongo: el recurso ya existe, no es un fallo del servidor.
  if (err?.code === 11000) {
    const field = Object.keys(err.keyPattern ?? {})[0];
    return res.status(409).json({
      ok: false,
      codigo: 'DUPLICADO',
      message: field ? `Ya existe un registro con ese ${field}.` : 'Ese registro ya existe.',
    });
  }

  // Id de Mongo mal formado: tampoco es un 500, es un recurso que no existe.
  if (err?.name === 'CastError' && err?.kind === 'ObjectId') {
    return res.status(404).json({ ok: false, message: 'Not found' });
  }

  /**
   * Token JWT vencido, mal firmado o mal formado: es un 401, no un 500.
   *
   * `jwt.verify` lanza estos tres al verificar, y el único sitio donde se
   * verifica fuera de un middleware con su propio `try` es `POST /auth/refresh`.
   * Sin esta rama, un refresh token caducado —un teléfono que lleva más de
   * treinta días sin abrir la app— salía como «Internal server error»: el
   * móvil lo pintaba como una avería del servidor y, como trata el 5xx como
   * reintentable, volvía a pedir lo mismo. La sesión sí había expirado; lo que
   * fallaba era el código de estado con el que se contaba.
   */
  if (ERRORES_JWT.has(err?.name)) {
    return res.status(401).json({ ok: false, message: 'Invalid session' });
  }

  /**
   * La base no responde: 503 con `Retry-After`, no 500.
   *
   * Con Atlas caído cada petición salía como 500, y el escritorio cuenta el
   * 5xx como fallo de esa escritura concreta: tras ocho la marcaba `fallida`,
   * cuando la nota estaba bien y lo que faltaba era la base. Un 503 los
   * clientes lo tratan como «sin servidor» y esperan con la cola intacta.
   */
  if (esFalloDeConexionConLaBase(err)) {
    console.error('[error] la base no responde:', err?.message ?? err);
    res.setHeader('Retry-After', '30');
    return res.status(503).json({ ok: false, codigo: 'BASE_NO_DISPONIBLE', message: 'Service unavailable' });
  }

  /**
   * Errores de subida. Un archivo demasiado grande es 413, no 500: el 5xx hacía
   * que el cliente reintentara solo la misma subida imposible, una y otra vez,
   * en vez de decirle a la persona que el archivo no cabe.
   */
  if (err instanceof MulterError) {
    const mensaje = err.code === 'LIMIT_FILE_SIZE'
      ? 'El archivo supera el tamaño máximo permitido.'
      : err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE'
        ? 'Se ha enviado más de un archivo o con un nombre de campo inesperado.'
        : 'No se pudo procesar el archivo enviado.';
    return res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ ok: false, message: mensaje });
  }

  const status = err.statusCode ?? 500;

  // Un 5xx puede llevar detalle interno; no se devuelve al cliente, pero sin
  // registrarlo el fallo desaparece sin dejar rastro.
  if (status >= 500) console.error('[error]', err);

  // `codigo` es opcional y de lectura mecánica: el cliente sin conexión decide
  // con él qué hacer con un 409 (no reintentar, avisar) sin comparar textos.
  // Solo se publica en errores de cliente: un 5xx no lleva detalle.
  const codigo = status < 500 && typeof err.codigo === 'string' ? err.codigo : undefined;

  res.status(status).json({
    ok: false,
    ...(codigo ? { codigo } : {}),
    message: status >= 500 ? 'Internal server error' : err.message ?? 'Error',
  });
};
