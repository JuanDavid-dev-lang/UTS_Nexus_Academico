import type { ErrorRequestHandler } from 'express';

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const status = err.statusCode ?? 500;
  res.status(status).json({
    ok: false,
    message: err.message ?? 'Internal server error',
  });
};

