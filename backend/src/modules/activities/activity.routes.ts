import { Router } from 'express';
import { z } from 'zod';
import * as campo from '../../shared/validation.js';
import { identificar, requireRole } from '../../middlewares/auth.js';
import * as servicio from './activity.service.js';

/**
 * Actividades académicas.
 *
 * Cumple el molde del proyecto: aquí solo se valida, se autoriza, se delega y
 * se responde. Ni un modelo importado. La versión anterior de este archivo
 * hacía las consultas en el handler, y por eso el alcance del docente no se
 * podía probar sin levantar servidor y base.
 */
export const activityRouter = Router();
activityRouter.use(identificar);

const ROLES_LECTURA = ['ADMIN', 'PROFESSOR', 'COORDINATOR', 'STUDENT'] as const;
const ROLES_ESCRITURA = ['ADMIN', 'PROFESSOR', 'COORDINATOR'] as const;

const filtros = z.object({
  subjectId: z.string().optional(),
  groupId: z.string().optional(),
  period: z.string().max(20).optional(),
  estado: z.enum(['OPEN', 'CLOSED', 'LATE']).optional(),
  desde: z.coerce.date().optional(),
  hasta: z.coerce.date().optional(),
  q: campo.linea.optional(),
});

const cuerpoAlta = z.object({
  title: campo.linea.min(1),
  description: campo.parrafo.default(''),
  subjectId: z.string().min(1),
  groupId: z.string().optional(),
  // Se acepta por compatibilidad con los clientes publicados, pero para un
  // docente el servicio lo sustituye por el de su sesión: un `teacherId` del
  // cuerpo nunca es prueba de propiedad.
  teacherId: z.string().optional(),
  period: z.string().max(20).optional(),
  dueAt: z.coerce.date(),
  weight: z.number().min(0).max(1).default(0),
  attachmentUrl: campo.url.optional(),
});

const cuerpoEdicion = z.object({
  title: campo.linea.min(1).optional(),
  description: campo.parrafo.optional(),
  groupId: z.string().optional(),
  dueAt: z.coerce.date().optional(),
  weight: z.number().min(0).max(1).optional(),
  attachmentUrl: campo.url.nullable().optional(),
});

/**
 * @openapi
 * /activities:
 *   get:
 *     tags: [Actividades]
 *     summary: Listado paginado y filtrable
 *     description: >
 *       `estado` filtra por el estado DERIVADO. `LATE` no está guardado: se
 *       resuelve en la consulta como «no cerrada y con `dueAt` ya pasado», de
 *       forma que el total coincide con lo que se ve.
 *     parameters:
 *       - { in: query, name: subjectId, schema: { type: string } }
 *       - { in: query, name: groupId, schema: { type: string } }
 *       - { in: query, name: period, schema: { type: string } }
 *       - in: query
 *         name: estado
 *         schema: { type: string, enum: [OPEN, CLOSED, LATE] }
 *       - { in: query, name: desde, schema: { type: string, format: date-time } }
 *       - { in: query, name: hasta, schema: { type: string, format: date-time } }
 *     responses:
 *       200:
 *         description: Actividades del alcance del solicitante
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/RespuestaPaginada' }
 */
activityRouter.get('/', requireRole(...ROLES_LECTURA), async (req, res, next) => {
  try {
    const filtro = filtros.parse(req.query);
    // El defecto sigue siendo 200, el tope que este endpoint ya devolvía:
    // bajarlo dejaría a los clientes publicados recibiendo menos sin error.
    const pagina = campo.paginacionCon(200).parse(req.query);
    const { items, total } = await servicio.listar(filtro, pagina, req.user!);
    res.json(campo.respuestaPaginada(items, total, pagina));
  } catch (err) {
    next(err);
  }
});

activityRouter.get('/:id', requireRole(...ROLES_LECTURA), async (req, res, next) => {
  try {
    res.json({ ok: true, item: await servicio.obtener(String(req.params.id), req.user!) });
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /activities:
 *   post:
 *     tags: [Actividades]
 *     summary: Crea una actividad
 *     description: >
 *       Para un docente el `teacherId` del cuerpo se ignora y se fuerza al de
 *       su sesión: un id enviado por el cliente nunca es prueba de propiedad.
 *     responses:
 *       201: { description: Actividad creada }
 *       400: { description: Datos inválidos }
 *       403: { description: La materia o el grupo no están asignados }
 */
activityRouter.post('/', requireRole(...ROLES_ESCRITURA), async (req, res, next) => {
  try {
    const body = cuerpoAlta.parse(req.body);
    const item = await servicio.crear(
      { ...body, teacherId: body.teacherId ?? req.user!.id },
      req.user!,
    );
    res.status(201).json({ ok: true, item });
  } catch (err) {
    next(err);
  }
});

activityRouter.patch('/:id', requireRole(...ROLES_ESCRITURA), async (req, res, next) => {
  try {
    const body = cuerpoEdicion.parse(req.body);
    res.json({ ok: true, item: await servicio.editar(String(req.params.id), body, req.user!) });
  } catch (err) {
    next(err);
  }
});

/** Cierre. Lo puede hacer el docente dueño. */
activityRouter.post('/:id/cierre', requireRole(...ROLES_ESCRITURA), async (req, res, next) => {
  try {
    res.json({ ok: true, item: await servicio.cambiarEstado(String(req.params.id), 'CLOSED', req.user!) });
  } catch (err) {
    next(err);
  }
});

/**
 * Reapertura. El servicio la niega a PROFESSOR: deshacer un cierre después de
 * la fecha límite cambia lo que se le puede exigir a un estudiante.
 *
 * @openapi
 * /activities/{id}/reapertura:
 *   post:
 *     tags: [Actividades]
 *     summary: Reabre una actividad cerrada
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: Actividad reabierta }
 *       403: { description: Un docente no puede reabrir; requiere coordinación }
 *       404: { description: No existe }
 */
activityRouter.post('/:id/reapertura', requireRole(...ROLES_ESCRITURA), async (req, res, next) => {
  try {
    res.json({ ok: true, item: await servicio.cambiarEstado(String(req.params.id), 'OPEN', req.user!) });
  } catch (err) {
    next(err);
  }
});

activityRouter.delete('/:id', requireRole(...ROLES_ESCRITURA), async (req, res, next) => {
  try {
    await servicio.eliminar(String(req.params.id), req.user!);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/**
 * Pasada manual del escáner de vencimientos.
 *
 * Existe para que un despliegue con varias instancias pueda apagar el
 * temporizador interno y llamar a esto desde un cron externo, igual que hace
 * `POST /notifications/risks/scan`.
 */
activityRouter.post('/avisos/scan', requireRole('ADMIN', 'COORDINATOR'), async (_req, res, next) => {
  try {
    const { generarAvisosDeVencimiento } = await import('./activity-due.service.js');
    res.json({ ok: true, ...(await generarAvisosDeVencimiento()) });
  } catch (err) {
    next(err);
  }
});
