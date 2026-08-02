import { Router } from 'express';
import { z } from 'zod';
import { SubjectModel } from '../../models/subject.model.js';
import { auth, requireRole } from '../../middlewares/auth.js';
import { emitSync } from '../../shared/socket.js';

export const subjectRouter = Router();

subjectRouter.use(auth);

subjectRouter.get('/', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'), async (_req, res, next) => {
  try {
    const filter: Record<string, unknown> = { deletedAt: null };
    if (_req.user?.role === 'PROFESSOR') filter.professorId = _req.user.id;
    const items = await SubjectModel.find(filter).sort({ period: -1, code: 1 }).limit(100).lean();
    res.json({ ok: true, items });
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
