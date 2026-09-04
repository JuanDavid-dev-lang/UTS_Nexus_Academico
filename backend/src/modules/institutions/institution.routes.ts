import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { exigirSesion, identificar, requireRole } from '../../middlewares/auth.js';
import { auditChange } from '../../shared/audit.js';
import { emitToAdmins, emitToUser } from '../../shared/socket.js';
import { LIMITES } from '../../domains/institutions/institution-profile.js';
import {
  ErrorInstitucion,
  actualizarInstitucion,
  asignarDocente,
  coincidenciasDe,
  configurarInstitucion,
  crearDesdeSolicitud,
  crearInstitucion,
  docentesDe,
  eliminarInstitucion,
  listarActivas,
  listarInstituciones,
  listarSolicitudes,
  obtenerInstitucion,
} from './institution.service.js';

/**
 * Perfiles institucionales.
 *
 * **Solo ADMIN escribe.** La institución de un docente decide con qué cortes
 * y ponderados se lee su trabajo, así que dejarle cambiarla a él —o a una
 * coordinación— sería dejar que se cambiara la regla con la que se le
 * evalúa. La lectura de la lista activa es para cualquier sesión: los
 * selectores la necesitan.
 *
 * Las universidades no están en el código: se crean aquí y el selector del
 * registro (`GET /registro/catalogo`) las lee de la base. Añadir una no
 * exige tocar nada más.
 */
export const institutionRouter = Router();
institutionRouter.use(identificar);

const ES_ADMIN = requireRole('ADMIN');

/** Traduce un error de negocio del servicio a su respuesta; el resto sigue a `error.ts`. */
function responderError(err: unknown, res: Response, next: NextFunction) {
  if (err instanceof ErrorInstitucion) {
    return res.status(err.statusCode).json({
      ok: false,
      message: err.message,
      errores: err.errores,
      ...(err.coincidencias ? { coincidencias: err.coincidencias } : {}),
    });
  }
  return next(err);
}

const aliasSchema = z.array(z.string().trim().max(LIMITES.NOMBRE_MAX)).max(LIMITES.ALIASES_MAX);

const datosInstitucion = z.object({
  // Opcional: lo normal es que el servidor lo genere a partir de la sigla.
  institutionId: z.string().trim().max(LIMITES.ID_MAX).optional(),
  nombre: z.string().trim().min(1).max(LIMITES.NOMBRE_MAX),
  sigla: z.string().trim().min(1).max(LIMITES.SIGLA_MAX),
  aliases: aliasSchema.default([]),
  activa: z.boolean().optional(),
});

const cambiosInstitucion = z
  .object({
    nombre: z.string().trim().min(1).max(LIMITES.NOMBRE_MAX),
    sigla: z.string().trim().min(1).max(LIMITES.SIGLA_MAX),
    aliases: aliasSchema,
    activa: z.boolean(),
  })
  .partial();

const pesoSchema = z.number().finite();

const configuracionSchema = z.object({
  cortes: z
    .array(z.object({ numero: z.number().int(), nombre: z.string().trim().max(60), peso: pesoSchema }))
    .max(LIMITES.CORTES_MAX),
  componentes: z
    .array(z.object({ id: z.string().trim().max(40), nombre: z.string().trim().max(60), peso: pesoSchema }))
    .max(LIMITES.COMPONENTES_MAX),
  notaMinima: z.number().finite(),
  notaMaxima: z.number().finite(),
  notaAprobacion: z.number().finite(),
});

const idParam = (req: Request) => String(req.params.id);

// ── Lectura ─────────────────────────────────────────────────────────────────

/**
 * @openapi
 * /instituciones/activas:
 *   get:
 *     summary: Instituciones activas para un selector (cualquier rol con sesión).
 */
institutionRouter.get('/activas', exigirSesion, async (_req, res, next) => {
  try {
    res.json({ ok: true, items: await listarActivas() });
  } catch (err) {
    next(err);
  }
});

/** Solicitudes de instituciones que todavía no existen. Antes que `/:id`. */
institutionRouter.get('/solicitudes', ES_ADMIN, async (_req, res, next) => {
  try {
    res.json({ ok: true, items: await listarSolicitudes() });
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /instituciones/coincidencias:
 *   get:
 *     summary: Perfiles que podrían ser la misma institución que la candidata.
 */
institutionRouter.get('/coincidencias', ES_ADMIN, async (req, res, next) => {
  try {
    const query = z
      .object({
        nombre: z.string().trim().max(LIMITES.NOMBRE_MAX).default(''),
        sigla: z.string().trim().max(LIMITES.SIGLA_MAX).optional(),
        aliases: z.string().trim().max(2000).optional(),
        excluir: z.string().trim().max(LIMITES.ID_MAX).optional(),
      })
      .parse(req.query);
    if (!query.nombre && !query.sigla) return res.json({ ok: true, items: [] });
    const aliases = query.aliases ? query.aliases.split('|').map(a => a.trim()).filter(Boolean) : [];
    const items = await coincidenciasDe({ nombre: query.nombre, sigla: query.sigla, aliases }, query.excluir);
    res.json({ ok: true, items });
  } catch (err) {
    next(err);
  }
});

institutionRouter.get('/', requireRole('ADMIN', 'COORDINATOR', 'SECRETARY'), async (req, res, next) => {
  try {
    const query = z
      .object({
        q: z.string().trim().max(120).optional(),
        activa: z.enum(['true', 'false']).optional(),
      })
      .parse(req.query);
    const items = await listarInstituciones({
      q: query.q,
      activa: query.activa === undefined ? undefined : query.activa === 'true',
    });
    // Coordinación y secretaría solo ven la suya; ADMIN (sin institución) todas.
    const propia = req.alcance?.institutionId ?? null;
    res.json({ ok: true, items: propia ? items.filter(item => item.id === propia) : items });
  } catch (err) {
    next(err);
  }
});

institutionRouter.get('/:id', requireRole('ADMIN', 'COORDINATOR', 'SECRETARY'), async (req, res, next) => {
  try {
    const item = await obtenerInstitucion(idParam(req));
    const propia = req.alcance?.institutionId ?? null;
    if (!item || (propia && item.id !== propia)) {
      return res.status(404).json({ ok: false, message: 'Institución no encontrada.' });
    }
    res.json({ ok: true, item });
  } catch (err) {
    next(err);
  }
});

institutionRouter.get('/:id/docentes', ES_ADMIN, async (req, res, next) => {
  try {
    res.json({ ok: true, items: await docentesDe(idParam(req)) });
  } catch (err) {
    responderError(err, res, next);
  }
});

// ── Escritura ───────────────────────────────────────────────────────────────

/**
 * @openapi
 * /instituciones:
 *   post:
 *     summary: Crea un perfil institucional (solo ADMIN). 409 si duplica nombre, sigla o alias.
 */
institutionRouter.post('/', ES_ADMIN, async (req, res, next) => {
  try {
    const datos = datosInstitucion.parse(req.body);
    const item = await crearInstitucion(datos, req.user?.id);
    await auditChange({
      actorId: req.user?.id,
      action: 'CREATE',
      entity: 'Institucion',
      entityId: item.id,
      after: item,
    });
    emitToAdmins('sync:update', { entity: 'institution', action: 'create', id: item.id });
    res.status(201).json({ ok: true, item });
  } catch (err) {
    responderError(err, res, next);
  }
});

institutionRouter.patch('/:id', ES_ADMIN, async (req, res, next) => {
  try {
    const cambios = cambiosInstitucion.parse(req.body);
    const { antes, despues } = await actualizarInstitucion(idParam(req), cambios, req.user?.id);
    await auditChange({
      actorId: req.user?.id,
      action: 'UPDATE',
      entity: 'Institucion',
      entityId: despues.id,
      before: antes,
      after: despues,
    });
    emitToAdmins('sync:update', { entity: 'institution', action: 'update', id: despues.id });
    res.json({ ok: true, item: despues });
  } catch (err) {
    responderError(err, res, next);
  }
});

/**
 * @openapi
 * /instituciones/{id}/configuracion:
 *   put:
 *     summary: Fija cortes, componentes y escala. Cuerpo `null` la deja sin configurar.
 */
institutionRouter.put('/:id/configuracion', ES_ADMIN, async (req, res, next) => {
  try {
    const config = z
      .union([configuracionSchema, z.null()])
      .parse(req.body?.configuracionAcademica === undefined ? req.body : req.body.configuracionAcademica);
    const { antes, despues } = await configurarInstitucion(idParam(req), config, req.user?.id);
    await auditChange({
      actorId: req.user?.id,
      action: 'UPDATE',
      entity: 'Institucion',
      entityId: despues.id,
      before: { configuracionAcademica: antes.configuracionAcademica },
      after: { configuracionAcademica: despues.configuracionAcademica },
    });
    emitToAdmins('sync:update', { entity: 'institution', action: 'update', id: despues.id });
    res.json({ ok: true, item: despues });
  } catch (err) {
    responderError(err, res, next);
  }
});

institutionRouter.delete('/:id', ES_ADMIN, async (req, res, next) => {
  try {
    const item = await eliminarInstitucion(idParam(req), req.user?.id);
    await auditChange({
      actorId: req.user?.id,
      action: 'DELETE',
      entity: 'Institucion',
      entityId: item.id,
      before: item,
    });
    emitToAdmins('sync:update', { entity: 'institution', action: 'delete', id: item.id });
    res.json({ ok: true, item });
  } catch (err) {
    responderError(err, res, next);
  }
});

// ── Docentes ────────────────────────────────────────────────────────────────

/** Asigna o cambia la institución de un docente. `institutionId: null` la quita. */
institutionRouter.patch('/docentes/:profesorId', ES_ADMIN, async (req, res, next) => {
  try {
    const { institutionId } = z
      .object({ institutionId: z.string().trim().min(1).max(40).nullable() })
      .parse(req.body);
    const resultado = await asignarDocente(String(req.params.profesorId), institutionId, req.user?.id);
    await auditChange({
      actorId: req.user?.id,
      action: 'UPDATE',
      entity: 'Profesor',
      entityId: resultado.docente.id,
      before: { institutionId: resultado.antes },
      after: { institutionId: resultado.despues },
    });
    // Al docente también: su perfil cambia de institución y debe verlo sin cerrar sesión.
    emitToUser(resultado.userId, 'sync:update', { entity: 'professor', action: 'update', id: resultado.docente.id });
    emitToAdmins('sync:update', { entity: 'institution', action: 'update', id: resultado.despues ?? resultado.antes ?? '' });
    res.json({ ok: true, item: resultado.docente });
  } catch (err) {
    responderError(err, res, next);
  }
});

// ── Solicitudes ─────────────────────────────────────────────────────────────

/** Asocia una solicitud a un perfil existente. */
institutionRouter.post('/solicitudes/:profesorId/asociar', ES_ADMIN, async (req, res, next) => {
  try {
    const { institutionId } = z.object({ institutionId: z.string().trim().min(1).max(40) }).parse(req.body);
    const resultado = await asignarDocente(String(req.params.profesorId), institutionId, req.user?.id);
    await auditChange({
      actorId: req.user?.id,
      action: 'UPDATE',
      entity: 'Profesor',
      entityId: resultado.docente.id,
      before: { institutionId: null, institucionSolicitada: resultado.docente.institucionSolicitada },
      after: { institutionId: resultado.despues },
    });
    emitToUser(resultado.userId, 'sync:update', { entity: 'professor', action: 'update', id: resultado.docente.id });
    emitToAdmins('sync:update', { entity: 'institution', action: 'update', id: resultado.despues ?? '' });
    res.json({ ok: true, item: resultado.docente });
  } catch (err) {
    responderError(err, res, next);
  }
});

/** Crea el perfil que pidió el docente y lo vincula en el mismo paso. */
institutionRouter.post('/solicitudes/:profesorId/crear', ES_ADMIN, async (req, res, next) => {
  try {
    const datos = datosInstitucion.parse(req.body);
    const { institucion, asignacion } = await crearDesdeSolicitud(String(req.params.profesorId), datos, req.user?.id);
    await auditChange({
      actorId: req.user?.id,
      action: 'CREATE',
      entity: 'Institucion',
      entityId: institucion.id,
      after: { ...institucion, desdeSolicitudDe: asignacion.docente.id },
    });
    emitToUser(asignacion.userId, 'sync:update', { entity: 'professor', action: 'update', id: asignacion.docente.id });
    emitToAdmins('sync:update', { entity: 'institution', action: 'create', id: institucion.id });
    res.status(201).json({ ok: true, item: institucion, docente: asignacion.docente });
  } catch (err) {
    responderError(err, res, next);
  }
});

