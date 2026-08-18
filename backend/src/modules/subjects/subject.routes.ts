import { Router } from 'express';
import { z } from 'zod';
import * as campo from '../../shared/validation.js';
import { SubjectModel } from '../../models/subject.model.js';
import { identificar, requireRole } from '../../middlewares/auth.js';
import { emitSync } from '../../shared/socket.js';

export const subjectRouter = Router();

subjectRouter.use(identificar);

subjectRouter.get('/', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'), async (_req, res, next) => {
  try {
    const pagina = campo.paginacionCon(100).parse(_req.query);
    const filter: Record<string, unknown> = { deletedAt: null };
    if (_req.user?.role === 'PROFESSOR') filter.professorId = _req.user.id;
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
    const item = await SubjectModel.findOne({ _id: req.params.id, deletedAt: null }).lean();
    if (!item) return res.status(404).json({ ok: false, message: 'Not found' });
    res.json({ ok: true, item });
  } catch (err) {
    next(err);
  }
});

subjectRouter.post('/', requireRole('ADMIN', 'PROFESSOR'), async (req, res, next) => {
  try {
    const body = z.object({
      name: z.string().min(3),
      code: z.string().min(2),
      professorId: z.string().min(1),
      period: z.string().min(4),
      credits: z.number().int().min(0).default(0),
    }).parse(req.body);

    if (req.user?.role === 'PROFESSOR' && req.user.id !== body.professorId) {
      return res.status(403).json({ ok: false, message: 'Forbidden' });
    }

    const item = await SubjectModel.create(body);
    emitSync('sync:update', { entity: 'subject', action: 'create', id: item.id });
    res.status(201).json({ ok: true, item });
  } catch (err) {
    next(err);
  }
});

subjectRouter.patch('/:id', requireRole('ADMIN', 'PROFESSOR'), async (req, res, next) => {
  try {
    const body = z.object({
      name: z.string().min(3).optional(),
      code: z.string().min(2).optional(),
      period: z.string().min(4).optional(),
      credits: z.number().int().min(0).optional(),
      studentIds: z.array(z.string()).optional(),
      scheduleIds: z.array(z.string()).optional(),
    }).parse(req.body);

    const item = await SubjectModel.findOneAndUpdate(
      { _id: req.params.id, deletedAt: null },
      { $set: body },
      { new: true }
    );
    if (!item) return res.status(404).json({ ok: false, message: 'Not found' });
    emitSync('sync:update', { entity: 'subject', action: 'update', id: item.id });
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
    emitSync('sync:update', { entity: 'subject', action: 'delete', id: item.id });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
