import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';

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
      message: field ? `Ya existe un registro con ese ${field}.` : 'Ese registro ya existe.',
    });
  }

  // Id de Mongo mal formado: tampoco es un 500, es un recurso que no existe.
  if (err?.name === 'CastError' && err?.kind === 'ObjectId') {
    return res.status(404).json({ ok: false, message: 'Not found' });
  }

  const status = err.statusCode ?? 500;

  // Un 5xx puede llevar detalle interno; no se devuelve al cliente, pero sin
  // registrarlo el fallo desaparece sin dejar rastro.
  if (status >= 500) console.error('[error]', err);

  res.status(status).json({
    ok: false,
    message: status >= 500 ? 'Internal server error' : err.message ?? 'Error',
  });
};
