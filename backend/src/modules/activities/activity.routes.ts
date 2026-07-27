import { Router } from 'express';
import { z } from 'zod';
import { ActivityModel } from '../../models/activity.model.js';
import { auth, requireRole } from '../../middlewares/auth.js';
import { emitSync } from '../../shared/socket.js';
import { getProfessorScope } from '../../shared/professor-scope.js';

export const activityRouter = Router();
activityRouter.use(auth);

activityRouter.get('/', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'), async (_req, res, next) => {
  try {
    const filter: Record<string, unknown> = { deletedAt: null };
    if (_req.user?.role === 'PROFESSOR') filter.teacherId = _req.user.id;
    const items = await ActivityModel.find(filter).limit(200).lean();
    res.json({ ok: true, items });
  } catch (err) {
    next(err);
  }
});

activityRouter.post('/', requireRole('ADMIN', 'PROFESSOR'), async (req, res, next) => {
  try {
    const body = z.object({
      title: z.string().min(1),
      description: z.string().default(''),
      subjectId: z.string(),
      groupId: z.string().optional(),
      teacherId: z.string(),
      dueAt: z.coerce.date(),
      weight: z.number().min(0).max(1).default(0),
      attachmentUrl: z.string().url().optional(),
    }).parse(req.body);
    if (req.user?.role === 'PROFESSOR') {
      const scope = await getProfessorScope(req.user.id);
      if (body.teacherId !== req.user.id) return res.status(403).json({ ok: false, message: 'Forbidden' });
      if (!scope.subjectIds.includes(body.subjectId)) return res.status(403).json({ ok: false, message: 'Subject not assigned' });
      if (body.groupId && !scope.groupIds.includes(body.groupId)) return res.status(403).json({ ok: false, message: 'Group not assigned' });
    }
    const item = await ActivityModel.create(body);
    emitSync('sync:update', { entity: 'activity', action: 'create', id: item.id });
    res.status(201).json({ ok: true, item });
  } catch (err) {
    next(err);
  }
});
