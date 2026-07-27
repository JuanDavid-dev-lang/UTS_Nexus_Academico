import { Router } from 'express';
import { z } from 'zod';
import { auth, requireRole } from '../../middlewares/auth.js';
import { ProfessorModel } from '../../models/professor.model.js';
import { emitSync } from '../../shared/socket.js';

export const professorRouter = Router();
professorRouter.use(auth);

professorRouter.get('/', requireRole('ADMIN', 'COORDINATOR'), async (_req, res, next) => {
  try {
    const items = await ProfessorModel.find({ deletedAt: null }).limit(100).lean();
    res.json({ ok: true, items });
  } catch (err) {
    next(err);
  }
});

professorRouter.patch('/:id', requireRole('ADMIN', 'COORDINATOR', 'PROFESSOR'), async (req, res, next) => {
  try {
    const body = z.object({
      employeeCode: z.string().optional(),
      department: z.string().optional(),
      title: z.string().optional(),
      photoUrl: z.string().url().nullable().optional(),
      signatureUrl: z.string().url().nullable().optional(),
    }).parse(req.body);
    const item = await ProfessorModel.findOneAndUpdate({ _id: req.params.id, deletedAt: null }, { $set: body }, { new: true });
    if (!item) return res.status(404).json({ ok: false, message: 'Not found' });
    emitSync('sync:update', { entity: 'professor', action: 'update', id: item.id });
    res.json({ ok: true, item });
  } catch (err) {
    next(err);
  }
});

