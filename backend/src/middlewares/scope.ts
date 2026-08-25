import type { NextFunction, Request, Response } from 'express';
import { getProgramScope } from '../shared/program-scope.js';
import { ALCANCE_TOTAL, type AlcanceDePrograma } from '../domains/scope/program-scope.js';

declare global {
  namespace Express {
    interface Request {
      /** Alcance por programa de quien consulta. Lo pone `cargarAlcance`. */
      alcance?: AlcanceDePrograma;
    }
  }
}

/**
 * Deja el alcance por programa en `req.alcance`.
 *
 * Va montado sobre el router de la API entera, no ruta por ruta: una ruta que
 * se olvidara de pedirlo vería `undefined` y —según cómo lo tratara— acabaría
 * consultando sin acotar. Con el middleware global, `req.alcance` existe
 * siempre y el peor caso de un descuido es `total: true` para quien de verdad
 * no se acota.
 *
 * Para ADMIN, docentes y estudiantes devuelve el alcance total sin tocar la
 * base: sus reglas son otras y la consulta sería trabajo tirado en cada
 * petición.
 */
export async function cargarAlcance(req: Request, _res: Response, next: NextFunction) {
  try {
    req.alcance = req.user ? await getProgramScope(req.user) : ALCANCE_TOTAL;
    next();
  } catch (err) {
    next(err);
  }
}
