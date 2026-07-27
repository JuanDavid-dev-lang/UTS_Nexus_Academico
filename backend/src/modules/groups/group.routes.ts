import { Router } from 'express';
import { z } from 'zod';
import { GroupModel } from '../../models/group.model.js';
import { auth, requireRole } from '../../middlewares/auth.js';
import { emitSync } from '../../shared/socket.js';

export const groupRouter = Router();

groupRouter.use(auth);

groupRouter.get('/', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'), async (_req, res, next) => {
  try {
    const filter: Record<string, unknown> = { deletedAt: null };
    if (_req.user?.role === 'PROFESSOR') filter.professorId = _req.user.id;
    const items = await GroupModel.find(filter).sort({ period: -1, name: 1 }).limit(100).lean();
    res.json({ ok: true, items });
  } catch (err) {
    next(err);
  }
});

groupRouter.get('/:id', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'), async (req, res, next) => {
  try {
    const item = await GroupModel.findOne({ _id: req.params.id, deletedAt: null }).lean();
    if (!item) return res.status(404).json({ ok: false, message: 'Not found' });
    res.json({ ok: true, item });
  } catch (err) {
    next(err);
  }
});

groupRouter.post('/', requireRole('ADMIN', 'PROFESSOR'), async (req, res, next) => {
  try {
    const body = z.object({
      name: z.string().min(1),
      subjectId: z.string().min(1),
      professorId: z.string().min(1),
      period: z.string().min(4),
    }).parse(req.body);

    const item = await GroupModel.create(body);
    emitSync('sync:update', { entity: 'group', action: 'create', id: item.id });
    res.status(201).json({ ok: true, item });
  } catch (err) {
    next(err);
  }
});

groupRouter.patch('/:id', requireRole('ADMIN', 'PROFESSOR'), async (req, res, next) => {
  try {
    const body = z.object({
      name: z.string().min(1).optional(),
      subjectId: z.string().optional(),
      period: z.string().min(4).optional(),
      studentIds: z.array(z.string()).optional(),
    }).parse(req.body);

    const item = await GroupModel.findOneAndUpdate(
      { _id: req.params.id, deletedAt: null },
      { $set: body },
      { new: true }
    );
    if (!item) return res.status(404).json({ ok: false, message: 'Not found' });
    emitSync('sync:update', { entity: 'group', action: 'update', id: item.id });
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
    emitSync('sync:update', { entity: 'group', action: 'delete', id: item.id });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
