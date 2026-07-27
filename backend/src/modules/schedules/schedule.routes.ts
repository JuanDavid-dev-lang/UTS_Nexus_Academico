import { Router } from 'express';
import { z } from 'zod';
import { ScheduleModel } from '../../models/schedule.model.js';
import { auth, requireRole } from '../../middlewares/auth.js';
import { emitSync } from '../../shared/socket.js';

export const scheduleRouter = Router();
scheduleRouter.use(auth);

scheduleRouter.get('/', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'), async (_req, res, next) => {
  try {
    const filter: Record<string, unknown> = { deletedAt: null };
    if (_req.user?.role === 'PROFESSOR') filter.teacherId = _req.user.id;
    const items = await ScheduleModel.find(filter).sort({ order: 1, dayOfWeek: 1, startTime: 1 }).limit(200).lean();
    res.json({ ok: true, items });
  } catch (err) {
    next(err);
  }
});

scheduleRouter.post('/', requireRole('ADMIN', 'PROFESSOR'), async (req, res, next) => {
  try {
    const body = z.object({
      subjectId: z.string(),
      groupId: z.string().optional(),
      teacherId: z.string(),
      dayOfWeek: z.number().int().min(1).max(7),
      startTime: z.string().regex(/^\d{2}:\d{2}$/),
      endTime: z.string().regex(/^\d{2}:\d{2}$/),
      order: z.number().int().min(0).default(0),
      durationMinutes: z.number().int().min(30).max(300).default(90),
      classroom: z.string().default(''),
      modality: z.enum(['PRESENTIAL', 'VIRTUAL', 'HYBRID']).default('PRESENTIAL'),
    }).parse(req.body);
    const item = await ScheduleModel.create(body);
    emitSync('sync:update', { entity: 'schedule', action: 'create', id: item.id });
    res.status(201).json({ ok: true, item });
  } catch (err) {
    next(err);
  }
});

scheduleRouter.patch('/:id', requireRole('ADMIN', 'PROFESSOR'), async (req, res, next) => {
  try {
    const body = z.object({
      order: z.number().int().min(0).optional(),
      dayOfWeek: z.number().int().min(1).max(7).optional(),
      startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
      endTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
      durationMinutes: z.number().int().min(30).max(300).optional(),
      classroom: z.string().optional(),
      modality: z.enum(['PRESENTIAL', 'VIRTUAL', 'HYBRID']).optional(),
    }).parse(req.body);
    const item = await ScheduleModel.findOneAndUpdate(
      { _id: req.params.id, deletedAt: null },
      { $set: body },
      { new: true }
    );
    if (!item) return res.status(404).json({ ok: false, message: 'Not found' });
    emitSync('sync:update', { entity: 'schedule', action: 'update', id: item.id });
    res.json({ ok: true, item });
  } catch (err) {
    next(err);
  }
});

scheduleRouter.post('/reorder', requireRole('ADMIN', 'PROFESSOR'), async (req, res, next) => {
  try {
    const body = z.object({
      items: z.array(z.object({ id: z.string(), order: z.number().int().min(0) })).min(1),
    }).parse(req.body);
    await Promise.all(
      body.items.map(item =>
        ScheduleModel.findOneAndUpdate(
          { _id: item.id, deletedAt: null },
          { $set: { order: item.order } },
          { new: true }
        )
      )
    );
    emitSync('sync:update', { entity: 'schedule', action: 'reorder', id: String(body.items.length) });
    res.json({ ok: true, count: body.items.length });
  } catch (err) {
    next(err);
  }
});
