import type { NextFunction, Request, Response } from 'express';
import { ProfessorModel } from '../models/professor.model.js';

/**
 * Exige que el docente autenticado sea director de trabajos de grado.
 *
 * ADMIN y COORDINATOR pasan siempre: gestionan el repositorio de formatos.
 * Para un PROFESSOR se consulta su ficha — el flag es institucional y vive en
 * `Profesor`, no en el token, así que activarlo surte efecto sin que el
 * docente tenga que cerrar sesión.
 *
 * Va SIEMPRE detrás de `identificar` + `requireRole`: aquí ya se asume que hay
 * sesión y un rol permitido.
 */
export async function requireDirector(req: Request, res: Response, next: NextFunction) {
  try {
    if (req.user?.role === 'ADMIN' || req.user?.role === 'COORDINATOR') return next();

    const ficha = await ProfessorModel.findOne({
      userId: req.user?.id,
      esDirectorTrabajoGrado: true,
      deletedAt: null,
    })
      .select('_id')
      .lean();

    if (!ficha) {
      return res.status(403).json({
        ok: false,
        message: 'Esta sección es para docentes directores de trabajo de grado. Pídele a la administración que active tu perfil.',
      });
    }
    next();
  } catch (err) {
    next(err);
  }
}
