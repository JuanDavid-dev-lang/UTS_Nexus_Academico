import { Router } from 'express';
import { z } from 'zod';
import { identificar, requireRole } from '../../middlewares/auth.js';
import { auditChange } from '../../shared/audit.js';
import { emitToUser } from '../../shared/socket.js';
import { LIMITES_PLANTILLA } from '../../domains/grading/plantilla-notas.js';
import {
  actualizarPlantilla,
  aplicarEstructura,
  borrarPlantilla,
  crearPlantilla,
  estructuraPara,
  listarEstructuras,
  listarPlantillas,
  quitarEstructura,
} from './grade-templates.service.js';

/**
 * Plantillas de corte (`/grades/plantillas`) y estructuras aplicadas
 * (`/grades/estructuras`).
 *
 * Una plantilla es del docente y dice cómo reparte las notas de un corte;
 * aplicarla a una materia (y a un grupo, si quiere) deja una estructura que la
 * captura usa para proponer lo que falta y poner el peso sin pedirlo. Nada de
 * esto escribe una nota: la plantilla propone, la nota se registra por
 * `POST /grades` como siempre.
 *
 * Este router va montado **antes** que `gradeRouter` en `/grades`: aquel
 * tiene `PATCH /:id` y `DELETE /:id`, y sin el orden `/plantillas/:id`
 * caería en ellos.
 */
export const gradeTemplatesRouter = Router();
gradeTemplatesRouter.use(identificar);

const notaPlantillaSchema = z.object({
  label: z.string().trim().min(1).max(LIMITES_PLANTILLA.ETIQUETA_MAX),
  weight: z.number().min(LIMITES_PLANTILLA.PESO_MIN).max(LIMITES_PLANTILLA.PESO_MAX),
});

const componentePlantillaSchema = z.object({
  tipo: z.enum(['TRABAJOS', 'PARCIALES', 'AUTOEVALUACION']),
  notas: z.array(notaPlantillaSchema).max(LIMITES_PLANTILLA.NOTAS_POR_COMPONENTE),
});

const estructuraSchema = z.array(componentePlantillaSchema).max(3);
const corteEnum = z.union([z.literal(1), z.literal(2), z.literal(3)]);

const ESCRITORES = ['ADMIN', 'PROFESSOR'] as const;
const LECTORES = ['ADMIN', 'PROFESSOR', 'COORDINATOR'] as const;

// ── Plantillas ──────────────────────────────────────────────────────────────

gradeTemplatesRouter.get('/plantillas', requireRole(...ESCRITORES), async (req, res, next) => {
  try {
    const items = await listarPlantillas(req.user!.id);
    res.json({ ok: true, items });
  } catch (err) {
    next(err);
  }
});

gradeTemplatesRouter.post('/plantillas', requireRole(...ESCRITORES), async (req, res, next) => {
  try {
    const body = z
      .object({ name: z.string().trim().min(1).max(80), componentes: estructuraSchema })
      .parse(req.body);
    const item = await crearPlantilla({ professorId: req.user!.id, ...body });
    await auditChange({
      actorId: req.user?.id,
      action: 'CREATE',
      entity: 'PlantillaNotas',
      entityId: item.id,
      after: item.toObject(),
    });
    emitToUser(req.user!.id, 'sync:update', { entity: 'gradeTemplate', action: 'create', id: item.id });
    res.status(201).json({ ok: true, item });
  } catch (err) {
    next(err);
  }
});

gradeTemplatesRouter.patch('/plantillas/:id', requireRole(...ESCRITORES), async (req, res, next) => {
  try {
    const body = z
      .object({
        name: z.string().trim().min(1).max(80).optional(),
        componentes: estructuraSchema.optional(),
      })
      .parse(req.body);
    const resultado = await actualizarPlantilla(String(req.params.id), req.user!.id, body);
    if (!resultado) return res.status(404).json({ ok: false, message: 'Not found' });
    await auditChange({
      actorId: req.user?.id,
      action: 'UPDATE',
      entity: 'PlantillaNotas',
      entityId: resultado.item.id,
      before: resultado.before,
      after: resultado.item.toObject(),
    });
    emitToUser(req.user!.id, 'sync:update', { entity: 'gradeTemplate', action: 'update', id: resultado.item.id });
    res.json({ ok: true, item: resultado.item });
  } catch (err) {
    next(err);
  }
});

gradeTemplatesRouter.delete('/plantillas/:id', requireRole(...ESCRITORES), async (req, res, next) => {
  try {
    const item = await borrarPlantilla(String(req.params.id), req.user!.id);
    if (!item) return res.status(404).json({ ok: false, message: 'Not found' });
    await auditChange({ actorId: req.user?.id, action: 'DELETE', entity: 'PlantillaNotas', entityId: item.id, before: item.toObject() });
    emitToUser(req.user!.id, 'sync:update', { entity: 'gradeTemplate', action: 'delete', id: item.id });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ── Estructuras aplicadas ───────────────────────────────────────────────────

/** Las estructuras del periodo: las del docente, o las del alcance para coordinación. */
gradeTemplatesRouter.get('/estructuras', requireRole(...LECTORES), async (req, res, next) => {
  try {
    const query = z.object({ period: z.string().min(4), subjectId: z.string().optional() }).parse(req.query);
    // Coordinación y secretaría solo ven las de sus carreras: se intersecta con
    // lo pedido, nunca se sustituye. Una materia ajena da lista vacía.
    let subjectIds: string[] | undefined = query.subjectId ? [query.subjectId] : undefined;
    if (req.alcance && !req.alcance.total) {
      const permitidas = req.alcance.subjectIds;
      subjectIds = subjectIds ? subjectIds.filter(id => permitidas.includes(id)) : permitidas;
    }
    const items = await listarEstructuras({
      period: query.period,
      subjectIds,
      professorId: req.user?.role === 'PROFESSOR' ? req.user.id : undefined,
    });
    res.json({ ok: true, items });
  } catch (err) {
    next(err);
  }
});

/** La estructura vigente para una materia (y grupo): la que la captura consulta. */
gradeTemplatesRouter.get('/estructuras/vigente', requireRole(...LECTORES), async (req, res, next) => {
  try {
    const query = z
      .object({ period: z.string().min(4), subjectId: z.string(), groupId: z.string().optional() })
      .parse(req.query);
    const item = await estructuraPara(query);
    res.json({ ok: true, item });
  } catch (err) {
    next(err);
  }
});

gradeTemplatesRouter.put('/estructuras', requireRole(...ESCRITORES), async (req, res, next) => {
  try {
    const body = z
      .object({
        subjectId: z.string(),
        groupId: z.string().nullable().optional(),
        period: z.string().min(4),
        plantillaId: z.string().nullable().optional(),
        nombre: z.string().trim().max(80).optional(),
        cortes: z
          .array(z.object({ corte: corteEnum, componentes: estructuraSchema }))
          .min(1)
          .max(3),
      })
      .parse(req.body);
    const { before, item } = await aplicarEstructura({
      professorId: req.user!.id,
      esAdmin: req.user?.role === 'ADMIN',
      ...body,
    });
    await auditChange({
      actorId: req.user?.id,
      action: before ? 'UPDATE' : 'CREATE',
      entity: 'EstructuraNotas',
      entityId: item._id,
      before,
      after: item,
    });
    emitToUser(item.professorId, 'sync:update', { entity: 'gradeStructure', action: before ? 'update' : 'create', id: item._id });
    res.status(before ? 200 : 201).json({ ok: true, item });
  } catch (err) {
    next(err);
  }
});

gradeTemplatesRouter.delete('/estructuras/:id', requireRole(...ESCRITORES), async (req, res, next) => {
  try {
    const item = await quitarEstructura(String(req.params.id), req.user!.id, req.user?.role === 'ADMIN');
    if (!item) return res.status(404).json({ ok: false, message: 'Not found' });
    await auditChange({ actorId: req.user?.id, action: 'DELETE', entity: 'EstructuraNotas', entityId: item._id, before: item });
    emitToUser(item.professorId, 'sync:update', { entity: 'gradeStructure', action: 'delete', id: item._id });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
