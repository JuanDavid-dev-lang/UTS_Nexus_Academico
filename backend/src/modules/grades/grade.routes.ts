import { Router } from 'express';
import { z } from 'zod';
import { GradeModel } from '../../models/grade.model.js';
import { StudentModel } from '../../models/student.model.js';
import { identificar, requireRole } from '../../middlewares/auth.js';
import { auditChange } from '../../shared/audit.js';
import { emitToUser } from '../../shared/socket.js';
import { getProfessorScope } from '../../shared/professor-scope.js';
import {
  calcularNotaFinal,
  type NotaComponente,
  type CorteNumero,
  type ComponenteTipo,
} from '../../domains/grading/grading.service.js';

export const gradeRouter = Router();
gradeRouter.use(identificar);

const componenteEnum = z.enum(['TRABAJOS', 'PARCIALES', 'AUTOEVALUACION']);
const corteEnum = z.union([z.literal(1), z.literal(2), z.literal(3)]);

/**
 * Convierte documentos Nota en entradas para el motor de calificación.
 *
 * Arrastra `_id` y `label` además del puntaje: el motor no los necesita para
 * calcular, pero son lo que permite que el consolidado devuelva de qué notas
 * salió cada promedio y que el docente pueda corregir la que está mal sin
 * buscarla en otra pantalla.
 */
function aNotasComponente(
  docs: Array<{ _id?: unknown; corte?: number; componentType?: string; score?: number; label?: string }>
): NotaComponente[] {
  return docs
    .filter(d => (d.corte === 1 || d.corte === 2 || d.corte === 3) && !!d.componentType)
    .map(d => ({
      corte: d.corte as CorteNumero,
      tipo: d.componentType as ComponenteTipo,
      score: Number(d.score ?? 0),
      ...(d._id ? { id: String(d._id) } : {}),
      ...(d.label ? { label: d.label } : {}),
    }));
}

// Listado plano de notas (scoped a profesor o al propio estudiante).
gradeRouter.get('/', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR', 'STUDENT'), async (req, res, next) => {
  try {
    const filter: Record<string, unknown> = { deletedAt: null };
    if (req.user?.role === 'PROFESSOR') filter.teacherId = req.user.id;
    if (req.user?.role === 'STUDENT') filter.studentId = req.user.studentId;
    if (req.query.studentId) filter.studentId = String(req.query.studentId);
    if (req.query.subjectId) filter.subjectId = String(req.query.subjectId);
    if (req.query.groupId) filter.groupId = String(req.query.groupId);
    if (req.query.period) filter.period = String(req.query.period);
    const items = await GradeModel.find(filter).limit(1000).lean();
    res.json({ ok: true, items });
  } catch (err) {
    next(err);
  }
});

/**
 * Notas consolidadas: aplica el motor 30/60/10 + cortes 33/33/34 y devuelve la
 * nota final por estudiante. ÚNICA fuente de verdad para clientes y reportes.
 */
gradeRouter.get('/consolidado', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR', 'STUDENT'), async (req, res, next) => {
  try {
    const query = z.object({
      period: z.string().min(4),
      subjectId: z.string().optional(),
      groupId: z.string().optional(),
      studentId: z.string().optional(),
    }).parse(req.query);

    const filter: Record<string, unknown> = { deletedAt: null, period: query.period };
    if (query.subjectId) filter.subjectId = query.subjectId;
    if (query.groupId) filter.groupId = query.groupId;
    if (req.user?.role === 'PROFESSOR') filter.teacherId = req.user.id;
    if (req.user?.role === 'STUDENT') filter.studentId = req.user.studentId;
    else if (query.studentId) filter.studentId = query.studentId;

    const grades = await GradeModel.find(filter).lean();

    // Agrupar por estudiante.
    const porEstudiante = new Map<string, typeof grades>();
    for (const grade of grades) {
      const key = String(grade.studentId);
      if (!porEstudiante.has(key)) porEstudiante.set(key, []);
      porEstudiante.get(key)!.push(grade);
    }

    const studentIds = [...porEstudiante.keys()];
    const students = await StudentModel.find({ _id: { $in: studentIds } })
      .select('code fullName')
      .lean();
    const studentMap = new Map(students.map(s => [String(s._id), s]));

    const items = studentIds
      .map(id => {
        const resumen = calcularNotaFinal(aNotasComponente(porEstudiante.get(id)!));
        const student = studentMap.get(id);
        return {
          studentId: id,
          code: student?.code ?? '',
          fullName: student?.fullName ?? '',
          ...resumen,
        };
      })
      .sort((a, b) => a.fullName.localeCompare(b.fullName));

    res.json({ ok: true, period: query.period, items });
  } catch (err) {
    next(err);
  }
});

// Captura de una nota atómica (componente dentro de un corte).
gradeRouter.post('/', requireRole('ADMIN', 'PROFESSOR'), async (req, res, next) => {
  try {
    const body = z.object({
      studentId: z.string(),
      subjectId: z.string(),
      groupId: z.string().optional(),
      teacherId: z.string(),
      corte: corteEnum,
      componentType: componenteEnum,
      label: z.string().min(1).default('Nota'),
      score: z.number().min(0).max(5),
      maxScore: z.number().positive().default(5),
      period: z.string().min(4),
    }).parse(req.body);

    if (req.user?.role === 'PROFESSOR') {
      const scope = await getProfessorScope(req.user.id);
      if (body.teacherId !== req.user.id) return res.status(403).json({ ok: false, message: 'Forbidden' });
      if (!scope.subjectIds.includes(body.subjectId)) return res.status(403).json({ ok: false, message: 'Subject not assigned' });
      if (!scope.studentIds.includes(body.studentId)) return res.status(403).json({ ok: false, message: 'Student not assigned' });
      if (body.groupId && !scope.groupIds.includes(body.groupId)) return res.status(403).json({ ok: false, message: 'Group not assigned' });
    }

    const key = {
      studentId: body.studentId,
      subjectId: body.subjectId,
      period: body.period,
      corte: body.corte,
      componentType: body.componentType,
      label: body.label,
    };
    const before = await GradeModel.findOne({ ...key, deletedAt: null }).lean();
    const item = await GradeModel.findOneAndUpdate(
      key,
      { $set: body },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    await auditChange({
      actorId: req.user?.id,
      action: before ? 'UPDATE' : 'CREATE',
      entity: 'Nota',
      entityId: item.id,
      before,
      after: item.toObject(),
    });
    emitToUser(String(item.teacherId), 'sync:update', { entity: 'grade', action: 'create', id: item.id });
    res.status(201).json({ ok: true, item });
  } catch (err) {
    next(err);
  }
});

gradeRouter.patch('/:id', requireRole('ADMIN', 'PROFESSOR'), async (req, res, next) => {
  try {
    const body = z.object({
      score: z.number().min(0).max(5).optional(),
      label: z.string().min(1).optional(),
    }).parse(req.body);
    const before = await GradeModel.findById(req.params.id).lean();
    if (req.user?.role === 'PROFESSOR' && before?.teacherId && String(before.teacherId) !== req.user.id) {
      return res.status(403).json({ ok: false, message: 'Forbidden' });
    }
    const item = await GradeModel.findOneAndUpdate({ _id: req.params.id, deletedAt: null }, { $set: body }, { new: true });
    if (!item) return res.status(404).json({ ok: false, message: 'Not found' });
    await auditChange({ actorId: req.user?.id, action: 'UPDATE', entity: 'Nota', entityId: item.id, before, after: item.toObject() });
    emitToUser(String(item.teacherId), 'sync:update', { entity: 'grade', action: 'update', id: item.id });
    res.json({ ok: true, item });
  } catch (err) {
    next(err);
  }
});

gradeRouter.delete('/:id', requireRole('ADMIN', 'PROFESSOR'), async (req, res, next) => {
  try {
    const before = await GradeModel.findById(req.params.id).lean();
    if (req.user?.role === 'PROFESSOR' && before?.teacherId && String(before.teacherId) !== req.user.id) {
      return res.status(403).json({ ok: false, message: 'Forbidden' });
    }
    const item = await GradeModel.findOneAndUpdate(
      { _id: req.params.id, deletedAt: null },
      { $set: { deletedAt: new Date(), status: 'DELETED' } },
      { new: true }
    );
    if (!item) return res.status(404).json({ ok: false, message: 'Not found' });
    await auditChange({ actorId: req.user?.id, action: 'DELETE', entity: 'Nota', entityId: item.id, before });
    emitToUser(String(item.teacherId), 'sync:update', { entity: 'grade', action: 'delete', id: item.id });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
