import { Router } from 'express';
import { z } from 'zod';
import * as campo from '../../shared/validation.js';
import { GroupModel } from '../../models/group.model.js';
import { SubjectModel } from '../../models/subject.model.js';
import { identificar, requireRole } from '../../middlewares/auth.js';
import { acotarPorAlcance } from '../../domains/scope/program-scope.js';
import { emitToUser } from '../../shared/socket.js';

export const groupRouter = Router();

groupRouter.use(identificar);

groupRouter.get('/', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'), async (_req, res, next) => {
  try {
    const query = z
      .object({
        subjectId: z.string().optional(),
        period: z.string().optional(),
      })
      .merge(campo.paginacionCon(100))
      .parse(_req.query);

    let filter: Record<string, unknown> = { deletedAt: null };
    if (query.subjectId) filter.subjectId = query.subjectId;
    if (query.period) filter.period = query.period;
    if (_req.user?.role === 'PROFESSOR') filter.professorId = _req.user.id;
    // Todos los grupos de sus carreras: es la pregunta que hace coordinación.
    if (_req.alcance && !_req.alcance.total) {
      filter = acotarPorAlcance(filter, '_id', _req.alcance.groupIds);
    }
    const { skip, limit } = campo.saltoYTope(query);
    const [items, total] = await Promise.all([
      GroupModel.find(filter).sort({ period: -1, name: 1 }).skip(skip).limit(limit).lean(),
      GroupModel.countDocuments(filter),
    ]);
    res.json(campo.respuestaPaginada(items, total, query));
  } catch (err) {
    next(err);
  }
});

groupRouter.get('/:id', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'), async (req, res, next) => {
  try {
    let filter: Record<string, unknown> = { _id: String(req.params.id), deletedAt: null };
    if (req.user?.role === 'PROFESSOR') filter.professorId = req.user.id;
    if (req.alcance && !req.alcance.total) {
      filter = acotarPorAlcance(filter, '_id', req.alcance.groupIds);
    }
    const item = await GroupModel.findOne(filter).lean();
    if (!item) return res.status(404).json({ ok: false, message: 'Not found' });
    res.json({ ok: true, item });
  } catch (err) {
    next(err);
  }
});

groupRouter.post('/', requireRole('ADMIN', 'PROFESSOR'), async (req, res, next) => {
  try {
    const body = z.object({
      name: campo.linea.min(1),
      subjectId: z.string().min(1),
      // Opcional: un docente siempre crea para sí mismo, y sin él el grupo
      // hereda al dueño de la materia. Exigirlo obligaba al cliente a mandar
      // un dato que el servidor iba a pisar de todas formas.
      professorId: z.string().min(1).optional(),
      period: campo.codigo.min(4),
    }).parse(req.body);

    let professorId = body.professorId;
    if (req.user?.role === 'PROFESSOR') {
      professorId = req.user.id;
    } else if (!professorId) {
      const subject = await SubjectModel.findById(body.subjectId).lean();
      if (!subject) {
        return res.status(404).json({ ok: false, message: 'La materia no existe.' });
      }
      professorId = subject.professorId ? String(subject.professorId) : req.user?.id;
    }
    if (!professorId) {
      return res.status(400).json({ ok: false, message: 'Falta el docente del grupo.' });
    }

    const item = await GroupModel.create({ ...body, professorId });
    emitToUser(String(item.professorId), 'sync:update', { entity: 'group', action: 'create', id: item.id });
    res.status(201).json({ ok: true, item });
  } catch (err) {
    next(err);
  }
});

groupRouter.patch('/:id', requireRole('ADMIN', 'PROFESSOR'), async (req, res, next) => {
  try {
    const body = z.object({
      name: campo.linea.min(1).optional(),
      subjectId: z.string().optional(),
      period: campo.codigo.min(4).optional(),
      studentIds: z.array(z.string()).max(2000).optional(),
    }).parse(req.body);

    const filter: Record<string, unknown> = { _id: req.params.id, deletedAt: null };
    if (req.user?.role === 'PROFESSOR') filter.professorId = req.user.id;
    const item = await GroupModel.findOneAndUpdate(
      filter,
      { $set: body },
      { new: true }
    );
    if (!item) return res.status(404).json({ ok: false, message: 'Not found' });
    emitToUser(String(item.professorId), 'sync:update', { entity: 'group', action: 'update', id: item.id });
    res.json({ ok: true, item });
  } catch (err) {
    next(err);
  }
});

groupRouter.delete('/:id', requireRole('ADMIN', 'COORDINATOR'), async (req, res, next) => {
  try {
    const item = await GroupModel.findOneAndUpdate(
      { _id: req.params.id, deletedAt: null },
      { $set: { deletedAt: new Date(), status: 'DELETED' } },
      { new: true }
    );
    if (!item) return res.status(404).json({ ok: false, message: 'Not found' });
    emitToUser(String(item.professorId), 'sync:update', { entity: 'group', action: 'delete', id: item.id });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
