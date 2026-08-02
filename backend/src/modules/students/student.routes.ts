import { Router } from 'express';
import { z } from 'zod';
import { StudentModel } from '../../models/student.model.js';
import { auth, requireRole } from '../../middlewares/auth.js';
import { emitSync } from '../../shared/socket.js';
import {
  getProfessorScope,
  getEnrolledStudentIds,
  professorOwnsStudent,
} from '../../shared/professor-scope.js';

export const studentRouter = Router();

studentRouter.use(auth);

/** Neutraliza los metacaracteres para que el texto buscado se trate como literal. */
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Intersección de dos conjuntos de ids, preservando el orden del primero. */
function intersect(a: string[], b: string[]): string[] {
  const allowed = new Set(b);
  return a.filter(id => allowed.has(id));
}

/**
 * Listado de estudiantes.
 *
 * Sin filtros devuelve el ámbito completo del rol; con `subjectId` o `groupId`
 * devuelve solo la lista de esa asignatura o grupo. Un docente nunca escapa de
 * su propio ámbito: los filtros se intersectan con él, no lo reemplazan.
 */
studentRouter.get('/', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'), async (req, res, next) => {
  try {
    const query = z
      .object({
        subjectId: z.string().optional(),
        groupId: z.string().optional(),
        period: z.string().optional(),
        q: z.string().trim().optional(),
      })
      .parse(req.query);

    const filter: Record<string, unknown> = { deletedAt: null };
    const isProfessor = req.user?.role === 'PROFESSOR';

    let allowedIds: string[] | null = null;
    if (isProfessor) {
      const scope = await getProfessorScope(req.user!.id);
      allowedIds = scope.studentIds;
    }

    if (query.subjectId || query.groupId || query.period) {
      const enrolled = await getEnrolledStudentIds({
        subjectId: query.subjectId,
        groupId: query.groupId,
        period: query.period,
        // Acota la matrícula al docente autenticado: un id de materia ajeno
        // deja de devolver nada en vez de filtrar la lista de otro profesor.
        professorId: isProfessor ? req.user!.id : undefined,
      });
      allowedIds = allowedIds ? intersect(allowedIds, enrolled) : enrolled;
    }

    if (allowedIds) filter._id = { $in: allowedIds };

    if (query.q) {
      const term = new RegExp(escapeRegex(query.q), 'i');
      filter.$or = [{ fullName: term }, { code: term }];
    }

    const items = await StudentModel.find(filter).sort({ code: 1, fullName: 1 }).limit(1000).lean();
    res.json({ ok: true, items });
  } catch (err) {
    next(err);
  }
});

/**
 * Búsqueda en el directorio global, para matricular en una materia nueva.
 *
 * Es deliberadamente más amplia que `GET /` — un docente tiene que poder
 * encontrar a un estudiante que aún no es suyo — y por eso devuelve solo la
 * identidad mínima: ni notas, ni asistencia, ni riesgo. Exige tres caracteres
 * y acota el resultado para que no sirva como volcado del padrón.
 */
studentRouter.get('/search', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'), async (req, res, next) => {
  try {
    const query = z
      .object({
        q: z.string().trim().min(3, 'Escribe al menos 3 caracteres para buscar'),
        limit: z.coerce.number().int().min(1).max(50).default(20),
      })
      .parse(req.query);

    const term = new RegExp(escapeRegex(query.q), 'i');
    const items = await StudentModel.find({
      deletedAt: null,
      $or: [{ fullName: term }, { code: term }],
    })
      .select('code fullName program photoUrl')
      .sort({ code: 1 })
      .limit(query.limit)
      .lean();

    res.json({ ok: true, items });
  } catch (err) {
    next(err);
  }
});

studentRouter.get('/:id', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'), async (req, res, next) => {
  try {
    if (req.user?.role === 'PROFESSOR' && !(await professorOwnsStudent(req.user.id, String(req.params.id)))) {
      return res.status(403).json({ ok: false, message: 'Estudiante fuera de tus asignaturas' });
    }
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
    if (req.user?.role === 'PROFESSOR' && !(await professorOwnsStudent(req.user.id, String(req.params.id)))) {
      return res.status(403).json({ ok: false, message: 'Estudiante fuera de tus asignaturas' });
    }

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
