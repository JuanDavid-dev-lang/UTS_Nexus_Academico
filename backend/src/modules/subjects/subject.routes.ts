import { Router } from 'express';
import { z } from 'zod';
import * as campo from '../../shared/validation.js';
import { SubjectModel } from '../../models/subject.model.js';
import { identificar, requireRole } from '../../middlewares/auth.js';
import { acotarPorAlcance } from '../../domains/scope/program-scope.js';
import { buscarPrograma } from '../../domains/catalog/uts.js';
import { emitToUser } from '../../shared/socket.js';

export const subjectRouter = Router();

subjectRouter.use(identificar);

subjectRouter.get('/', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'), async (_req, res, next) => {
  try {
    const pagina = campo.paginacionCon(100).parse(_req.query);
    let filter: Record<string, unknown> = { deletedAt: null };
    if (_req.user?.role === 'PROFESSOR') filter.professorId = _req.user.id;
    // Coordinación y secretaría ven las materias de sus programas, las dicte
    // quien las dicte. Con el alcance total (ADMIN, o sin programas asignados)
    // esto no toca el filtro.
    if (_req.alcance && !_req.alcance.total) {
      filter = acotarPorAlcance(filter, '_id', _req.alcance.subjectIds);
    }
    const { skip, limit } = campo.saltoYTope(pagina);
    const [items, total] = await Promise.all([
      SubjectModel.find(filter).sort({ period: -1, code: 1 }).skip(skip).limit(limit).lean(),
      SubjectModel.countDocuments(filter),
    ]);
    res.json(campo.respuestaPaginada(items, total, pagina));
  } catch (err) {
    next(err);
  }
});

subjectRouter.get('/:id', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'), async (req, res, next) => {
  try {
    let filter: Record<string, unknown> = { _id: String(req.params.id), deletedAt: null };
    if (req.user?.role === 'PROFESSOR') filter.professorId = req.user.id;
    // La ficha se comprueba igual que el listado: acotar solo la lista deja el
    // detalle accesible a quien copie un id de otra carrera.
    if (req.alcance && !req.alcance.total) {
      filter = acotarPorAlcance(filter, '_id', req.alcance.subjectIds);
    }
    const item = await SubjectModel.findOne(filter).lean();
    if (!item) return res.status(404).json({ ok: false, message: 'Not found' });
    res.json({ ok: true, item });
  } catch (err) {
    next(err);
  }
});

subjectRouter.post('/', requireRole('ADMIN', 'PROFESSOR'), async (req, res, next) => {
  try {
    const body = z.object({
      name: campo.nombre.min(3),
      code: campo.codigo.min(2),
      professorId: z.string().min(1),
      period: campo.codigo.min(4),
      credits: z.number().int().min(0).default(0),
      /**
       * Programa academico (id del catalogo). Es lo que decide que
       * coordinacion ve la materia, asi que se valida contra el catalogo: un id
       * inventado no falla en ningun sitio, solo deja la materia invisible para
       * la coordinacion que deberia verla.
       */
      programa: campo.codigo
        .refine(id => Boolean(buscarPrograma(id)), 'Ese programa no esta en el catalogo academico.')
        .nullable()
        .optional(),
    }).parse(req.body);

    if (req.user?.role === 'PROFESSOR' && req.user.id !== body.professorId) {
      return res.status(403).json({ ok: false, message: 'Forbidden' });
    }

    const item = await SubjectModel.create(body);
    emitToUser(String(item.professorId), 'sync:update', { entity: 'subject', action: 'create', id: item.id });
    res.status(201).json({ ok: true, item });
  } catch (err) {
    next(err);
  }
});

/**
 * Coordinacion tambien edita: marcar a que programa pertenece una materia es
 * justo su tarea, y sin ella las materias historicas se quedarian para siempre
 * dependiendo de la adscripcion del docente que las dicte. El alcance se aplica
 * igual que en el listado, asi que solo alcanza a las materias de sus carreras.
 */
subjectRouter.patch('/:id', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'), async (req, res, next) => {
  try {
    const body = z.object({
      name: campo.nombre.min(3).optional(),
      code: campo.codigo.min(2).optional(),
      period: campo.codigo.min(4).optional(),
      credits: z.number().int().min(0).optional(),
      /**
       * Programa academico (id del catalogo). Es lo que decide que
       * coordinacion ve la materia, asi que se valida contra el catalogo: un id
       * inventado no falla en ningun sitio, solo deja la materia invisible para
       * la coordinacion que deberia verla.
       */
      programa: campo.codigo
        .refine(id => Boolean(buscarPrograma(id)), 'Ese programa no esta en el catalogo academico.')
        .nullable()
        .optional(),
      studentIds: z.array(z.string()).max(2000).optional(),
      scheduleIds: z.array(z.string()).max(200).optional(),
    }).parse(req.body);

    let filter: Record<string, unknown> = { _id: String(req.params.id), deletedAt: null };
    if (req.user?.role === 'PROFESSOR') filter.professorId = req.user.id;
    if (req.alcance && !req.alcance.total) {
      filter = acotarPorAlcance(filter, '_id', req.alcance.subjectIds);
    }
    const item = await SubjectModel.findOneAndUpdate(
      filter,
      { $set: body },
      { new: true }
    );
    if (!item) return res.status(404).json({ ok: false, message: 'Not found' });
    emitToUser(String(item.professorId), 'sync:update', { entity: 'subject', action: 'update', id: item.id });
    res.json({ ok: true, item });
  } catch (err) {
    next(err);
  }
});

subjectRouter.delete('/:id', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const item = await SubjectModel.findOneAndUpdate(
      { _id: req.params.id, deletedAt: null },
      { $set: { deletedAt: new Date(), status: 'DELETED' } },
      { new: true }
    );
    if (!item) return res.status(404).json({ ok: false, message: 'Not found' });
    emitToUser(String(item.professorId), 'sync:update', { entity: 'subject', action: 'delete', id: item.id });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
