import { Router } from 'express';
import { z } from 'zod';
import { StudentModel } from '../../models/student.model.js';
import { SubjectModel } from '../../models/subject.model.js';
import { GroupModel } from '../../models/group.model.js';
import { auth, requireRole } from '../../middlewares/auth.js';
import { emitSync } from '../../shared/socket.js';
import { getProfessorScope } from '../../shared/professor-scope.js';

export const studentRouter = Router();

studentRouter.use(auth);

studentRouter.get('/', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'), async (_req, res, next) => {
  try {
    const filter: Record<string, unknown> = { deletedAt: null };
    if (_req.user?.role === 'PROFESSOR') {
      const scope = await getProfessorScope(_req.user.id);
      filter._id = { $in: scope.studentIds };
    }
    const items = await StudentModel.find(filter).sort({ code: 1, fullName: 1 }).limit(1000).lean();
    res.json({ ok: true, items });
  } catch (err) {
    next(err);
  }
});

studentRouter.get('/:id', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'), async (req, res, next) => {
  try {
    const item = await StudentModel.findOne({ _id: req.params.id, deletedAt: null }).lean();
    if (!item) return res.status(404).json({ ok: false, message: 'Not found' });
    res.json({ ok: true, item });
  } catch (err) {
    next(err);
  }
});

studentRouter.post('/', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'), async (req, res, next) => {
  try {
    const body = z.object({
      code: z.string().min(3),
      fullName: z.string().min(3),
      email: z.string().email(),
      program: z.string().min(2),
      photoUrl: z.string().url().optional(),
    }).parse(req.body);

    const item = await StudentModel.create(body);
    emitSync('sync:update', { entity: 'student', action: 'create', id: item.id });
    res.status(201).json({ ok: true, item });
  } catch (err) {
    next(err);
  }
});

studentRouter.post('/bulk', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'), async (req, res, next) => {
  try {
    const body = z.array(z.object({
      code: z.string().min(3),
      fullName: z.string().min(3),
      email: z.string().email(),
      program: z.string().min(2),
      photoUrl: z.string().url().nullable().optional(),
    })).min(1).parse(req.body);

    const items = [];
    for (const row of body) {
      const item = await StudentModel.findOneAndUpdate(
        { code: row.code, deletedAt: null },
        { $set: row, $setOnInsert: { academicHistory: [], attendanceRate: 0, academicPerformance: 0 } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      if (item) items.push(item);
    }
    emitSync('sync:update', { entity: 'student', action: 'bulk', id: String(items.length) });
    res.status(201).json({ ok: true, items, count: items.length });
  } catch (err) {
    next(err);
  }
});

studentRouter.patch('/:id', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'), async (req, res, next) => {
  try {
    const body = z.object({
      fullName: z.string().min(3).optional(),
      email: z.string().email().optional(),
      program: z.string().min(2).optional(),
      photoUrl: z.string().url().nullable().optional(),
      attendanceRate: z.number().min(0).max(100).optional(),
      academicPerformance: z.number().min(0).max(5).optional(),
    }).parse(req.body);

    const item = await StudentModel.findOneAndUpdate(
      { _id: req.params.id, deletedAt: null },
      { $set: body },
      { new: true }
    );
    if (!item) return res.status(404).json({ ok: false, message: 'Not found' });
    emitSync('sync:update', { entity: 'student', action: 'update', id: item.id });
    res.json({ ok: true, item });
  } catch (err) {
    next(err);
  }
});

studentRouter.delete('/:id', requireRole('ADMIN', 'COORDINATOR'), async (req, res, next) => {
  try {
    const item = await StudentModel.findOneAndUpdate(
      { _id: req.params.id, deletedAt: null },
      { $set: { deletedAt: new Date(), status: 'DELETED' } },
      { new: true }
    );
    if (!item) return res.status(404).json({ ok: false, message: 'Not found' });
    emitSync('sync:update', { entity: 'student', action: 'delete', id: item.id });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
