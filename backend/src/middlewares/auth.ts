import type { RequestHandler } from 'express';
import { verifyAccessToken } from '../shared/jwt.js';
import type { Role } from '../shared/types.js';

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; role: Role; tenantId?: string; studentId?: string };
    }
  }
}

/**
 * Dice **quién** es quien llama. No decide si puede pasar.
 *
 * Sin cabecera `Authorization` deja seguir con `req.user` vacío, porque hay
 * rutas legítimamente anónimas —el catálogo del formulario de registro, los
 * enlaces de descarga de la página— que cuelgan de routers donde el resto sí
 * exige sesión.
 *
 * Se llamaba `auth`, y ese nombre costó caro: parece una puerta y no lo es.
 * Cualquier ruta que solo lo llevara quedaba abierta a internet, y así estuvo
 * el listado de avisos hasta que se detectó. **Quien corta es `exigirSesion` o
 * `requireRole`, y uno de los dos tiene que ir en todas las rutas.**
 */
export const identificar: RequestHandler = (req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next();
  try {
    const token = header.slice(7);
    const payload = verifyAccessToken(token);
    req.user = {
      id: payload.sub,
      role: payload.role,
      tenantId: payload.tenantId,
      studentId: payload.studentId,
    };
    next();
  } catch {
    return res.status(401).json({ ok: false, message: 'Invalid token' });
  }
};

/**
 * Exige sesión, sin mirar el rol.
 *
 * Para lo que cualquier usuario autenticado puede ver pero un desconocido no:
 * el estado del modelo de riesgo, el del asistente. Sin esto había que poner un
 * `requireRole` con la lista entera de roles, y una lista de roles es algo que
 * se olvida de actualizar.
 */
export const exigirSesion: RequestHandler = (req, res, next) => {
  if (!req.user) return res.status(401).json({ ok: false, message: 'Unauthorized' });
  next();
};

export const requireRole =
  (...roles: Role[]): RequestHandler =>
  (req, res, next) => {
    if (!req.user) return res.status(401).json({ ok: false, message: 'Unauthorized' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ ok: false, message: 'Forbidden' });
    next();
  };
