import { Router } from 'express';
import { z } from 'zod';
import { EnrollmentModel } from '../../models/enrollment.model.js';
import { GroupModel } from '../../models/group.model.js';
import { StudentModel } from '../../models/student.model.js';
import { auth, requireRole } from '../../middlewares/auth.js';
import { auditChange } from '../../shared/audit.js';
import { emitToUser } from '../../shared/socket.js';

export const enrollmentRouter = Router();
enrollmentRouter.use(auth);

/** Verifica que el grupo pertenezca al profesor autenticado (o que sea ADMIN/COORDINATOR). */
async function assertGroupOwnership(req: any, groupId: string) {
  const group = await GroupModel.findOne({ _id: groupId, deletedAt: null }).lean();
  if (!group) return { error: { status: 404, message: 'Grupo no encontrado' } };
  if (req.user?.role === 'PROFESSOR' && String(group.professorId) !== req.user.id) {
    return { error: { status: 403, message: 'Grupo no asignado' } };
  }
  return { group };
}

// Matrículas de un grupo (o todas las del profesor).
enrollmentRouter.get('/', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'), async (req, res, next) => {
  try {
    const filter: Record<string, unknown> = { deletedAt: null };
    if (req.user?.role === 'PROFESSOR') filter.professorId = req.user.id;
    if (req.query.groupId) filter.groupId = String(req.query.groupId);
    if (req.query.period) filter.period = String(req.query.period);
    const items = await EnrollmentModel.find(filter)
      .populate('studentId', 'code fullName email program')
      .sort({ createdAt: -1 })
      .limit(2000)
      .lean();
    res.json({ ok: true, items });
  } catch (err) {
    next(err);
  }
});

// Matricular un estudiante existente en un grupo.
enrollmentRouter.post('/', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'), async (req, res, next) => {
  try {
    const body = z.object({ studentId: z.string(), groupId: z.string() }).parse(req.body);
    const owned = await assertGroupOwnership(req, body.groupId);
    if (owned.error) return res.status(owned.error.status).json({ ok: false, message: owned.error.message });
    const group = owned.group!;

    const item = await EnrollmentModel.findOneAndUpdate(
      { studentId: body.studentId, groupId: body.groupId, period: group.period },
      {
        $set: { enrollmentStatus: 'ACTIVE' },
        $setOnInsert: {
          studentId: body.studentId,
          groupId: body.groupId,
          subjectId: group.subjectId,
          professorId: group.professorId,
          period: group.period,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    await auditChange({ actorId: req.user?.id, action: 'CREATE', entity: 'Matricula', entityId: item.id, after: item.toObject() });
    emitToUser(String(group.professorId), 'sync:update', { entity: 'enrollment', action: 'create', id: item.id });
    res.status(201).json({ ok: true, item });
  } catch (err) {
    next(err);
  }
});

/**
 * Importación masiva: crea/actualiza estudiantes (por cédula) y los matricula en
 * el grupo. Orden de columnas esperado: cédula (code), nombres (fullName).
 */
enrollmentRouter.post('/bulk', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'), async (req, res, next) => {
  try {
    const body = z.object({
      groupId: z.string(),
      students: z.array(z.object({
        code: z.string().min(3),
        fullName: z.string().min(3),
        email: z.string().email().optional(),
        program: z.string().optional(),
      })).min(1),
    }).parse(req.body);

    const owned = await assertGroupOwnership(req, body.groupId);
    if (owned.error) return res.status(owned.error.status).json({ ok: false, message: owned.error.message });
    const group = owned.group!;

    let matriculados = 0;
    for (const row of body.students) {
      const student = await StudentModel.findOneAndUpdate(
        { code: row.code, deletedAt: null },
        {
          $set: { fullName: row.fullName },
          $setOnInsert: {
            code: row.code,
            email: row.email ?? `${row.code}@estudiantes.uts.edu.co`,
            program: row.program ?? 'UTS',
            academicHistory: [],
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      await EnrollmentModel.findOneAndUpdate(
        { studentId: student.id, groupId: group._id, period: group.period },
        {
          $set: { enrollmentStatus: 'ACTIVE' },
          $setOnInsert: {
            studentId: student.id,
            groupId: group._id,
            subjectId: group.subjectId,
            professorId: group.professorId,
            period: group.period,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      matriculados += 1;
    }

    emitToUser(String(group.professorId), 'sync:update', { entity: 'enrollment', action: 'bulk', id: body.groupId });
    res.status(201).json({ ok: true, count: matriculados });
  } catch (err) {
    next(err);
  }
});

// Retirar (soft) una matrícula.
enrollmentRouter.delete('/:id', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'), async (req, res, next) => {
  try {
    const before = await EnrollmentModel.findById(req.params.id).lean();
    if (!before) return res.status(404).json({ ok: false, message: 'Not found' });
    if (req.user?.role === 'PROFESSOR' && String(before.professorId) !== req.user.id) {
      return res.status(403).json({ ok: false, message: 'Forbidden' });
    }
    await EnrollmentModel.updateOne(
      { _id: req.params.id },
      { $set: { deletedAt: new Date(), enrollmentStatus: 'WITHDRAWN', status: 'DELETED' } }
    );
    await auditChange({ actorId: req.user?.id, action: 'DELETE', entity: 'Matricula', entityId: String(before._id), before });
    emitToUser(String(before.professorId), 'sync:update', { entity: 'enrollment', action: 'delete', id: req.params.id });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
