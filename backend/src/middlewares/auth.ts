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

export const auth: RequestHandler = (req, res, next) => {
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

export const requireRole =
  (...roles: Role[]): RequestHandler =>
  (req, res, next) => {
    if (!req.user) return res.status(401).json({ ok: false, message: 'Unauthorized' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ ok: false, message: 'Forbidden' });
    next();
  };
