import type { RequestHandler } from 'express';
import { verifyAccessToken } from '../shared/jwt.js';
import { autorizadoPorRol, puedeEscribir } from '../domains/scope/role-access.js';
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

/**
 * Corta por rol.
 *
 * No compara el rol directamente: pregunta a `autorizadoPorRol`, que sabe que
 * **secretaría vale como coordinación en lectura**. Escribir aquí
 * `roles.includes(req.user.role)` obligaría a añadir `'SECRETARY'` a las
 * sesenta llamadas que ya nombran a `'COORDINATOR'`, y la que se olvidara no
 * daría un error: dejaría a secretaría con una pantalla vacía y sin explicación.
 */
export const requireRole =
  (...roles: Role[]): RequestHandler =>
  (req, res, next) => {
    if (!req.user) return res.status(401).json({ ok: false, message: 'Unauthorized' });
    if (!autorizadoPorRol(req.user.role, req.method, roles)) {
      return res.status(403).json({ ok: false, message: 'Forbidden' });
    }
    next();
  };

/**
 * Cierra la escritura a los roles de solo lectura. **Va antes que los módulos.**
 *
 * El corte es por método HTTP con una lista corta de excepciones, no ruta por
 * ruta. Marcar cuáles son de escritura habría dejado fuera la ruta que alguien
 * añada el mes que viene, y una ruta de escritura sin marcar no falla: concede.
 *
 * El mensaje dice qué pasó y a quién pedírselo. Un 403 seco sobre un formulario
 * que se rellenó entero se lee como un fallo de la aplicación, y acaba
 * reportado como tal.
 */
export const bloquearSoloLectura: RequestHandler = (req, res, next) => {
  if (puedeEscribir(req.user?.role, req.method, req.path)) return next();
  return res.status(403).json({
    ok: false,
    message: 'Tu perfil es de consulta: puedes ver y exportar, pero no modificar. Pídele el cambio a coordinación.',
  });
};
