import { Router } from 'express';
import { z } from 'zod';
import * as campo from '../../shared/validation.js';
import { identificar, exigirSesion } from '../../middlewares/auth.js';
import * as servicio from './timeline.service.js';

/**
 * Historial cronológico del estudiante.
 *
 * Cuelga de `/students/:id/historial` a través del índice de rutas. Valida,
 * autoriza —el alcance real lo comprueba el servicio con
 * `professorOwnsStudent()`— delega y responde.
 */
export const timelineRouter = Router();
timelineRouter.use(identificar);

const TIPOS = [
  'MATRICULA',
  'NOTA',
  'ASISTENCIA',
  'ALERTA_RIESGO',
  'INTERVENCION',
  'PATRON_ASISTENCIA',
  'ACTIVIDAD',
  'CIERRE_PERIODO',
] as const;

/**
 * @openapi
 * /students/{id}/historial:
 *   get:
 *     tags: [Estudiantes]
 *     summary: Línea de tiempo académica
 *     description: >
 *       Une matrículas, notas, ausencias y retrasos, alertas de riesgo,
 *       intervenciones, patrones de inasistencia, actividades y cierres de
 *       periodo. La unión y el orden los hace el backend: el cliente no cruza
 *       colecciones. Un estudiante solo ve el suyo; un docente, los de su
 *       alcance (`professorOwnsStudent`).
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *       - { in: query, name: period, schema: { type: string } }
 *       - in: query
 *         name: tipos
 *         description: Lista separada por comas, p. ej. `NOTA,ASISTENCIA`
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Eventos ordenados del más reciente al más antiguo
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/RespuestaPaginada' }
 *       403: { description: Fuera del alcance del solicitante }
 */
timelineRouter.get('/:id/historial', exigirSesion, async (req, res, next) => {
  try {
    const consulta = z
      .object({
        period: z.string().max(20).optional(),
        subjectId: z.string().max(40).optional(),
        // Una lista separada por comas: `?tipos=NOTA,ASISTENCIA`. Repetir el
        // parámetro también funciona, pero un solo formato evita que cada
        // cliente elija el suyo.
        tipos: z.string().max(200).optional(),
        desde: z.coerce.date().optional(),
        hasta: z.coerce.date().optional(),
      })
      .parse(req.query);
    const pagina = campo.paginacionCon(100).parse(req.query);

    const tipos = consulta.tipos
      ?.split(',')
      .map(t => t.trim().toUpperCase())
      .filter((t): t is (typeof TIPOS)[number] => (TIPOS as readonly string[]).includes(t));

    const { items, total } = await servicio.construirHistorial(
      {
        studentId: String(req.params.id),
        period: consulta.period,
        subjectId: consulta.subjectId,
        tipos,
        desde: consulta.desde,
        hasta: consulta.hasta,
      },
      pagina,
      req.user!,
    );
    res.json(campo.respuestaPaginada(items, total, pagina));
  } catch (err) {
    next(err);
  }
});

timelineRouter.get('/:id/seguimiento', exigirSesion, async (req, res, next) => {
  try {
    const consulta = z.object({
      period: z.string().max(20).optional(),
      subjectId: z.string().max(40).optional(),
    }).parse(req.query);
    const pagina = campo.paginacionCon(20).parse(req.query);
    const item = await servicio.construirExpedienteSeguimiento({
      studentId: String(req.params.id), period: consulta.period, subjectId: consulta.subjectId,
    }, pagina, req.user!);
    res.json({ ok: true, item });
  } catch (err) { next(err); }
});
