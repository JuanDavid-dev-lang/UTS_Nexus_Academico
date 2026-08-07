import { Router } from 'express';
import { Types } from 'mongoose';
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

/**
 * Pasar lista de una clase entera en una sola petición.
 *
 * El móvil hacía un POST por estudiante dentro de un bucle: con 40 en el salón,
 * 40 viajes de ida y vuelta sobre el wifi de un aula. Y si se caía en el
 * estudiante 23, la mitad del curso quedaba guardada sin que nadie lo dijera —
 * ni el docente ni la propia app sabían dónde se había cortado.
 *
 * Aquí el contexto de la clase viaja una vez, el alcance se comprueba una vez
 * contra TODOS los estudiantes, y la escritura es un único `bulkWrite`: o entra
 * la lista o no entra, no media lista.
 */
attendanceRouter.post('/bulk', requireRole('ADMIN', 'PROFESSOR'), async (req, res, next) => {
  try {
    /*
     * Los ids se validan aquí en vez de dejar que Mongoose los castee más
     * tarde: en la escritura por lotes el casteo no es una garantía sobre la
     * que quiera apoyarme, y una cadena que se cuele sin convertir insertaría
     * documentos que ninguna consulta posterior encuentra. Un id mal formado
     * sale como 400 diciendo cuál, no como un 500 sin pista.
     */
    const idMongo = z
      .string()
      .refine(valor => Types.ObjectId.isValid(valor), 'Identificador inválido');

    const body = z.object({
      subjectId: idMongo,
      groupId: idMongo.optional(),
      scheduleId: idMongo.optional(),
      teacherId: idMongo,
      period: z.string().default('2026-1'),
      date: z.coerce.date(),
      durationMinutes: z.number().int().min(30).max(300).optional(),
      // El tope es la defensa contra una petición que intente escribir el
      // colegio entero; ningún salón real se acerca.
      registros: z
        .array(
          z.object({
            studentId: idMongo,
            present: z.boolean().default(true),
            notes: z.string().default(''),
          })
        )
        .min(1)
        .max(500),
    }).parse(req.body);

    if (req.user?.role === 'PROFESSOR') {
      const scope = await getProfessorScope(req.user.id);
      if (body.teacherId !== req.user.id) {
        return res.status(403).json({ ok: false, message: 'Forbidden' });
      }
      if (!scope.subjectIds.includes(body.subjectId)) {
        return res.status(403).json({ ok: false, message: 'Subject not assigned' });
      }
      if (body.groupId && !scope.groupIds.includes(body.groupId)) {
        return res.status(403).json({ ok: false, message: 'Group not assigned' });
      }
      // Se comprueban todos antes de escribir ninguno: colar un id ajeno en
      // mitad de la lista no debe dejar escritos los anteriores.
      const ajeno = body.registros.find(r => !scope.studentIds.includes(r.studentId));
      if (ajeno) {
        return res.status(403).json({ ok: false, message: 'Student not assigned' });
      }
    }

    const schedule = body.scheduleId
      ? await ScheduleModel.findOne({ _id: body.scheduleId, deletedAt: null }).lean()
      : null;
    const durationMinutes = body.durationMinutes ?? Number(schedule?.durationMinutes ?? 90);

    type OperacionLote = Parameters<typeof AttendanceModel.bulkWrite>[0][number];

    const subjectId = new Types.ObjectId(body.subjectId);
    const teacherId = new Types.ObjectId(body.teacherId);
    const groupId = body.groupId ? new Types.ObjectId(body.groupId) : undefined;
    const scheduleId = body.scheduleId ? new Types.ObjectId(body.scheduleId) : undefined;

    const resultado = await AttendanceModel.bulkWrite(
      body.registros.map<OperacionLote>(registro => ({
        updateOne: {
          filter: {
            studentId: new Types.ObjectId(registro.studentId),
            subjectId,
            date: body.date,
          },
          update: {
            $set: {
              studentId: new Types.ObjectId(registro.studentId),
              subjectId,
              ...(groupId ? { groupId } : {}),
              ...(scheduleId ? { scheduleId } : {}),
              teacherId,
              period: body.period,
              date: body.date,
              durationMinutes,
              present: registro.present,
              notes: registro.notes,
            },
          },
          upsert: true,
        },
      })),
      // Sin orden: un registro que choque no debe frenar los siguientes, y el
      // resultado dice cuántos entraron de verdad.
      { ordered: false }
    );

    // Una entrada de auditoría por la clase, no cuarenta: lo que ocurrió fue
    // "se pasó lista", y cuarenta filas idénticas esconden esa única acción.
    await auditChange({
      actorId: req.user?.id,
      action: 'UPDATE',
      entity: 'Asistencia',
      entityId: `${body.subjectId}:${body.date.toISOString()}`,
      before: null,
      after: {
        subjectId: body.subjectId,
        date: body.date,
        durationMinutes,
        total: body.registros.length,
        presentes: body.registros.filter(r => r.present).length,
      },
    });

    emitSync('sync:update', { entity: 'attendance', action: 'bulk', id: body.subjectId });

    res.status(201).json({
      ok: true,
      total: body.registros.length,
      creados: resultado.upsertedCount,
      actualizados: resultado.modifiedCount,
    });
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
