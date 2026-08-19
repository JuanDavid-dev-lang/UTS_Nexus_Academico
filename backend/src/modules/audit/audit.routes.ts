import { Router } from 'express';
import { z } from 'zod';
import * as campo from '../../shared/validation.js';
import { identificar, requireRole } from '../../middlewares/auth.js';
import * as servicio from './audit.service.js';

/**
 * Consulta del registro de auditoría.
 *
 * **Solo ADMIN.** Un COORDINATOR administra docentes y catálogo, pero la
 * auditoría contiene los cambios de todo el mundo —incluidos los del propio
 * ADMIN sobre cuentas— y darle acceso convertiría el panel en una forma
 * cómoda de vigilar al personal. Si algún día la política institucional lo
 * exige, se abre aquí y se documenta el porqué; no antes.
 */
export const auditRouter = Router();
auditRouter.use(identificar);
auditRouter.use(requireRole('ADMIN'));

/**
 * @openapi
 * /audit:
 *   get:
 *     tags: [Administración]
 *     summary: Registro de auditoría (solo ADMIN)
 *     description: >
 *       Las filas traen QUÉ campos cambiaron, no su contenido: una tabla con
 *       dos documentos completos por fila no se lee. El detalle se pide por id.
 *       Contraseñas, tokens y códigos de recuperación no están guardados: el
 *       saneado ocurre al escribir, en `shared/sanitize.ts`.
 *     parameters:
 *       - { in: query, name: actorId, schema: { type: string } }
 *       - { in: query, name: action, schema: { type: string } }
 *       - { in: query, name: entity, schema: { type: string } }
 *       - { in: query, name: entityId, schema: { type: string } }
 *       - { in: query, name: desde, schema: { type: string, format: date } }
 *       - { in: query, name: hasta, schema: { type: string, format: date } }
 *     responses:
 *       200:
 *         description: Registros, lo más reciente primero
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/RespuestaPaginada' }
 *       403: { description: Solo ADMIN }
 */
auditRouter.get('/', async (req, res, next) => {
  try {
    const filtro = z
      .object({
        actorId: z.string().optional(),
        action: campo.linea.optional(),
        entity: campo.linea.optional(),
        entityId: z.string().optional(),
        desde: z.coerce.date().optional(),
        hasta: z.coerce.date().optional(),
        q: campo.linea.optional(),
      })
      .parse(req.query);
    const pagina = campo.paginacionCon(100).parse(req.query);

    const { items, total } = await servicio.listar(filtro, pagina);
    res.json(campo.respuestaPaginada(items, total, pagina));
  } catch (err) {
    next(err);
  }
});

/** Valores existentes de acción y entidad, para los desplegables del filtro. */
auditRouter.get('/catalogo', async (_req, res, next) => {
  try {
    res.json({ ok: true, ...(await servicio.catalogo()) });
  } catch (err) {
    next(err);
  }
});

auditRouter.get('/:id', async (req, res, next) => {
  try {
    res.json({ ok: true, item: await servicio.obtener(String(req.params.id)) });
  } catch (err) {
    next(err);
  }
});
