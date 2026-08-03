import { Router } from 'express';
import { z } from 'zod';
import { AttendanceModel } from '../../models/attendance.model.js';
import { ScheduleModel } from '../../models/schedule.model.js';
import { identificar, requireRole } from '../../middlewares/auth.js';
import { auditChange } from '../../shared/audit.js';
import { emitSync } from '../../shared/socket.js';
import { getProfessorScope } from '../../shared/professor-scope.js';

export const attendanceRouter = Router();
attendanceRouter.use(identificar);

attendanceRouter.get('/', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR', 'STUDENT'), async (_req, res, next) => {
  try {
    const query = _req.query ?? {};
    const filter: Record<string, unknown> = { deletedAt: null };
    if (query.studentId) filter.studentId = String(query.studentId);
    if (query.subjectId) filter.subjectId = String(query.subjectId);
    if (query.groupId) filter.groupId = String(query.groupId);
    if (query.period) filter.period = String(query.period);
    if (_req.user?.role === 'PROFESSOR') filter.teacherId = _req.user.id;
    // El estudiante solo ve su propia asistencia.
    if (_req.user?.role === 'STUDENT') filter.studentId = _req.user.studentId;
    const items = await AttendanceModel.find(filter).sort({ date: -1 }).limit(1000).lean();
    res.json({ ok: true, items });
  } catch (err) {
    next(err);
  }
});

attendanceRouter.post('/', requireRole('ADMIN', 'PROFESSOR'), async (req, res, next) => {
  try {
    const body = z.object({
      studentId: z.string(),
      subjectId: z.string(),
      groupId: z.string().optional(),
      scheduleId: z.string().optional(),
      teacherId: z.string(),
      period: z.string().default('2026-1'),
      date: z.coerce.date(),
      durationMinutes: z.number().int().min(30).max(300).optional(),
      present: z.boolean().default(true),
      notes: z.string().default(''),
    }).parse(req.body);

    if (req.user?.role === 'PROFESSOR') {
      const scope = await getProfessorScope(req.user.id);
      if (body.teacherId !== req.user.id) return res.status(403).json({ ok: false, message: 'Forbidden' });
      if (!scope.subjectIds.includes(body.subjectId)) return res.status(403).json({ ok: false, message: 'Subject not assigned' });
      if (!scope.studentIds.includes(body.studentId)) return res.status(403).json({ ok: false, message: 'Student not assigned' });
      if (body.groupId && !scope.groupIds.includes(body.groupId)) return res.status(403).json({ ok: false, message: 'Group not assigned' });
    }

    const schedule = body.scheduleId
      ? await ScheduleModel.findOne({ _id: body.scheduleId, deletedAt: null }).lean()
      : null;
    const durationMinutes = body.durationMinutes ?? Number(schedule?.durationMinutes ?? 90);
    const before = await AttendanceModel.findOne({
      studentId: body.studentId,
      subjectId: body.subjectId,
      date: body.date,
      deletedAt: null,
    }).lean();
    const item = await AttendanceModel.findOneAndUpdate(
      {
        studentId: body.studentId,
        subjectId: body.subjectId,
        date: body.date,
      },
      { $set: { ...body, durationMinutes } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    await auditChange({
      actorId: req.user?.id,
      action: before ? 'UPDATE' : 'CREATE',
      entity: 'Asistencia',
      entityId: item.id,
      before,
      after: item.toObject(),
    });
    emitSync('sync:update', { entity: 'attendance', action: 'create', id: item.id });
    res.status(201).json({ ok: true, item });
  } catch (err) {
    next(err);
  }
});

attendanceRouter.get('/summary/:studentId', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR', 'STUDENT'), async (req, res, next) => {
  try {
    const studentId = String(req.params.studentId);
    if (req.user?.role === 'PROFESSOR') {
      const scope = await getProfessorScope(req.user.id);
      if (!scope.studentIds.includes(studentId)) return res.status(403).json({ ok: false, message: 'Forbidden' });
    }
    if (req.user?.role === 'STUDENT' && req.user.studentId !== studentId) {
      return res.status(403).json({ ok: false, message: 'Forbidden' });
    }
    const items = await AttendanceModel.find({ studentId, deletedAt: null }).lean();
    const totalMinutes = items.reduce((sum, row) => sum + Number(row.durationMinutes ?? 90), 0);
    const presentMinutes = items.reduce((sum, row) => sum + (row.present ? Number(row.durationMinutes ?? 90) : 0), 0);
    const totalClasses = items.length;
    const misses = items.filter(row => !row.present).length;
    const attendanceRate = totalMinutes ? Number(((presentMinutes / totalMinutes) * 100).toFixed(2)) : 0;
    res.json({ ok: true, summary: { totalClasses, misses, totalMinutes, presentMinutes, attendanceRate } });
  } catch (err) {
    next(err);
  }
});
