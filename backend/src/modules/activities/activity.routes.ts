import { Router } from 'express';
import { z } from 'zod';
import * as campo from '../../shared/validation.js';
import { ActivityModel } from '../../models/activity.model.js';
import { identificar, requireRole } from '../../middlewares/auth.js';
import { emitSync } from '../../shared/socket.js';
import { getProfessorScope } from '../../shared/professor-scope.js';

export const activityRouter = Router();
activityRouter.use(identificar);

activityRouter.get('/', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'), async (req, res, next) => {
  try {
    const filter: Record<string, unknown> = { deletedAt: null };
    if (req.user?.role === 'PROFESSOR') filter.teacherId = req.user.id;
    const pagina = campo.paginacionCon(200).parse(req.query);
    const { skip, limit } = campo.saltoYTope(pagina);
    const [items, total] = await Promise.all([
      ActivityModel.find(filter).sort({ dueAt: -1 }).skip(skip).limit(limit).lean(),
      ActivityModel.countDocuments(filter),
    ]);
    res.json(campo.respuestaPaginada(items, total, pagina));
  } catch (err) {
    next(err);
  }
});

activityRouter.post('/', requireRole('ADMIN', 'PROFESSOR'), async (req, res, next) => {
  try {
    const body = z.object({
      title: campo.linea.min(1),
      description: campo.parrafo.default(''),
      subjectId: z.string(),
      groupId: z.string().optional(),
      teacherId: z.string(),
      dueAt: z.coerce.date(),
      weight: z.number().min(0).max(1).default(0),
      attachmentUrl: campo.url.optional(),
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
