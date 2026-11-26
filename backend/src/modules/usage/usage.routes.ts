import { Router } from 'express';
import { z } from 'zod';
import * as campo from '../../shared/validation.js';
import { identificar, requireRole } from '../../middlewares/auth.js';
import { ROLES } from '../../shared/types.js';
import { env } from '../../shared/env.js';
import { diaDeCampus } from '../../domains/attendance/class-date.js';
import { sumarDias, validarRango } from '../../domains/usage/usage.js';
import { getPlantilla } from '../reports/report-template.js';
import { fechaHoraDeCampus } from '../reports/report-layout.js';
import { rankingDeUso, resumenDeUso, type FiltroResumen } from './usage.service.js';
import { enviarUsoExcel } from './usage.renderer.js';

/**
 * Uso de la aplicación: cuánto se usa y quién la usa más.
 *
 * **Solo ADMIN**, por la misma razón que la auditoría: es información sobre el
 * personal, y abrirla a coordinación la convertiría en una forma de vigilar a
 * los docentes. Es estadística interna; no se publica (ver
 * `docs/USO_Y_PRIVACIDAD.md`).
 */
export const usageRouter = Router();
usageRouter.use(identificar);
usageRouter.use(requireRole('ADMIN'));

const PATRON_DIA = /^\d{4}-\d{2}-\d{2}$/;

const consulta = z.object({
  desde: z.string().regex(PATRON_DIA).optional(),
  hasta: z.string().regex(PATRON_DIA).optional(),
  institutionId: z.string().trim().max(40).optional(),
  rol: z.enum(ROLES as [string, ...string[]]).optional(),
});

/** Rango por defecto: los 30 días que terminan hoy en el campus. */
function filtroDe(query: unknown): FiltroResumen {
  const q = consulta.parse(query);
  const hoy = diaDeCampus(new Date(), env.CAMPUS_UTC_OFFSET_MIN);
  const hasta = q.hasta ?? hoy;
  const desde = q.desde ?? sumarDias(hasta, -29);
  const error = validarRango(desde, hasta);
  if (error) {
    const e = new Error(error) as Error & { statusCode: number };
    e.statusCode = 400;
    throw e;
  }
  return { desde, hasta, institutionId: q.institutionId || undefined, rol: q.rol };
}

/**
 * @openapi
 * /uso/resumen:
 *   get:
 *     tags: [Administración]
 *     summary: Uso de la aplicación (solo ADMIN)
 *     description: >
 *       Activos por día, por cliente y por rol, activos hoy / 7 / 30 días y el
 *       ranking de quienes más la usan (una página, `page` y `limit`).
 *       Minutos activos = franjas de 5 minutos con al menos una petición.
 *     parameters:
 *       - { in: query, name: desde, schema: { type: string, format: date } }
 *       - { in: query, name: hasta, schema: { type: string, format: date } }
 *       - { in: query, name: institutionId, schema: { type: string } }
 *       - { in: query, name: rol, schema: { type: string } }
 *     responses:
 *       200: { description: Resumen }
 *       403: { description: Solo ADMIN }
 */
usageRouter.get('/resumen', async (req, res, next) => {
  try {
    const filtro = filtroDe(req.query);
    const pagina = campo.paginacionCon(20).parse(req.query);
    res.json(await resumenDeUso(filtro, pagina));
  } catch (err) {
    next(err);
  }
});

/** Solo el ranking, paginado con `items` en la raíz. */
usageRouter.get('/ranking', async (req, res, next) => {
  try {
    const filtro = filtroDe(req.query);
    const pagina = campo.paginacionCon(50).parse(req.query);
    const { items, total } = await rankingDeUso(filtro, pagina);
    res.json(campo.respuestaPaginada(items, total, pagina));
  } catch (err) {
    next(err);
  }
});

/** Exportable del ranking completo. `GET`: exportar es leer. */
usageRouter.get('/export.xlsx', async (req, res, next) => {
  try {
    const filtro = filtroDe(req.query);
    const { items } = await rankingDeUso(filtro, { page: 1, limit: campo.TOPE_PAGINA });
    await enviarUsoExcel(res, items, `uso-${filtro.desde}-a-${filtro.hasta}.xlsx`, {
      plantilla: await getPlantilla(),
      detalles: [
        { etiqueta: 'Desde', valor: filtro.desde },
        { etiqueta: 'Hasta', valor: filtro.hasta },
        ...(filtro.rol ? [{ etiqueta: 'Rol', valor: filtro.rol }] : []),
        { etiqueta: 'Generado', valor: fechaHoraDeCampus(new Date(), env.CAMPUS_UTC_OFFSET_MIN) },
      ],
    });
  } catch (err) {
    next(err);
  }
});
