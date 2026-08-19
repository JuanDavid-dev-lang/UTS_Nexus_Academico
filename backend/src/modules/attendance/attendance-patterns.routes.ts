import { Router } from 'express';
import { z } from 'zod';
import * as campo from '../../shared/validation.js';
import { identificar, requireRole } from '../../middlewares/auth.js';
import * as servicio from './attendance-patterns.service.js';

/**
 * Casos de seguimiento por patrón de inasistencia.
 *
 * Valida, autoriza, delega y responde. La detección es pura
 * (`domains/attendance/patterns.ts`) y la orquestación vive en el servicio.
 */
export const attendancePatternRouter = Router();
attendancePatternRouter.use(identificar);

attendancePatternRouter.get(
  '/casos',
  requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'),
  async (req, res, next) => {
    try {
      const filtro = z
        .object({
          studentId: z.string().optional(),
          subjectId: z.string().optional(),
          period: z.string().max(20).optional(),
          status: z.enum(['ABIERTO', 'EN_SEGUIMIENTO', 'RESUELTO', 'DESCARTADO']).optional(),
        })
        .parse(req.query);
      const pagina = campo.paginacionCon(200).parse(req.query);

      // El docente solo ve los suyos. Se impone aquí, después de leer la URL.
      const acotado: servicio.FiltroCasos = { ...filtro };
      if (req.user!.role === 'PROFESSOR') acotado.teacherId = req.user!.id;

      const { items, total } = await servicio.listarCasos(acotado, pagina);
      res.json(campo.respuestaPaginada(items, total, pagina));
    } catch (err) {
      next(err);
    }
  },
);

attendancePatternRouter.post(
  '/casos/:id/intervencion',
  requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'),
  async (req, res, next) => {
    try {
      const body = z
        .object({
          nota: campo.nota.min(3),
          estado: z.enum(['EN_SEGUIMIENTO', 'RESUELTO', 'DESCARTADO']).default('EN_SEGUIMIENTO'),
        })
        .parse(req.body);
      const item = await servicio.registrarIntervencion(String(req.params.id), body, req.user!);
      res.json({ ok: true, item });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * Pasada manual del escáner.
 *
 * Igual que el de riesgo: existe para que un despliegue con varias instancias
 * apague el temporizador interno y lo llame desde un cron externo.
 */
attendancePatternRouter.post(
  '/patrones/scan',
  requireRole('ADMIN', 'COORDINATOR'),
  async (req, res, next) => {
    try {
      const filtro = z.object({ period: z.string().max(20).optional() }).parse(req.body ?? {});
      res.json({ ok: true, ...(await servicio.escanearPatronesDeAsistencia(filtro)) });
    } catch (err) {
      next(err);
    }
  },
);
