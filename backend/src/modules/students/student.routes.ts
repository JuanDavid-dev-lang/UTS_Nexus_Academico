import { Router } from 'express';
import { z } from 'zod';
import * as campo from '../../shared/validation.js';
import { identificar, requireRole } from '../../middlewares/auth.js';
import { emitSync } from '../../shared/socket.js';
import {
  getProfessorScope,
  getEnrolledStudentIds,
  professorOwnsStudent,
} from '../../shared/professor-scope.js';
import { intersectar } from '../../domains/scope/professor-scope.js';
import { dentroDelAlcanceDePrograma } from '../../domains/scope/program-scope.js';
import {
  createStudent,
  findStudent,
  listStudents,
  searchStudents,
  softDeleteStudent,
  updateStudent,
  upsertStudents,
} from './student.service.js';

export const studentRouter = Router();

studentRouter.use(identificar);

/** Neutraliza los metacaracteres para que el texto buscado se trate como literal. */
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
        q: z.string().trim().max(120).optional(),
      })
      .merge(campo.paginacionCon(1000))
      .parse(req.query);

    const filter: Record<string, unknown> = { deletedAt: null };
    const isProfessor = req.user?.role === 'PROFESSOR';

    let allowedIds: string[] | null = null;
    if (isProfessor) {
      const scope = await getProfessorScope(req.user!.id);
      allowedIds = scope.studentIds;
    }
    // Coordinación y secretaría: los estudiantes matriculados en materias de
    // sus programas. Se intersecta como el de docente —nunca reemplaza— para
    // que un `?subjectId=` ajeno devuelva vacío en lugar de la lista de otro.
    if (req.alcance && !req.alcance.total) {
      allowedIds = allowedIds
        ? intersectar(allowedIds, req.alcance.studentIds)
        : req.alcance.studentIds;
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
      allowedIds = allowedIds ? intersectar(allowedIds, enrolled) : enrolled;
    }

    if (allowedIds) filter._id = { $in: allowedIds };

    if (query.q) {
      const term = new RegExp(escapeRegex(query.q), 'i');
      filter.$or = [{ fullName: term }, { code: term }];
    }

    // El conteo va en paralelo con la página: son dos consultas independientes
    // y encadenarlas duplicaba la espera sin ninguna razón.
    const { skip, limit } = campo.saltoYTope(query);
    const { items, total } = await listStudents(filter, skip, limit);
    res.json(campo.respuestaPaginada(items, total, query));
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
        q: z.string().trim().min(3, 'Escribe al menos 3 caracteres para buscar').max(120),
        limit: z.coerce.number().int().min(1).max(50).default(20),
      })
      .parse(req.query);

    const term = new RegExp(escapeRegex(query.q), 'i');
    const items = await searchStudents(term, query.limit);

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
    if (!dentroDelAlcanceDePrograma(req.alcance!, 'studentIds', req.params.id)) {
      return res.status(403).json({ ok: false, message: 'Estudiante fuera de tus programas' });
    }
    const item = await findStudent(String(req.params.id));
    if (!item) return res.status(404).json({ ok: false, message: 'Not found' });
    res.json({ ok: true, item });
  } catch (err) {
    next(err);
  }
});

/**
 * Ficha de estudiante. Una sola definición para el alta unitaria y la masiva:
 * dos copias divergen, y la que se olvida acaba siendo la que no valida.
 */
const fichaEstudiante = z.object({
  code: campo.codigo.min(3),
  fullName: campo.nombre.min(3),
  email: campo.correo.optional(),
  program: campo.linea.min(2),
  photoUrl: campo.url.nullable().optional(),
});

studentRouter.post('/', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'), async (req, res, next) => {
  try {
    const body = fichaEstudiante.parse(req.body);

    const item = await createStudent(body);
    emitSync('sync:update', { entity: 'student', action: 'create', id: item.id });
    res.status(201).json({ ok: true, item });
  } catch (err) {
    next(err);
  }
});

studentRouter.post('/bulk', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'), async (req, res, next) => {
  try {
    // El tope no es cosmético: sin él, el tamaño del lote lo decidía el límite
    // del cuerpo HTTP, que no tiene ninguna relación con lo que esta ruta puede
    // escribir de una vez.
    const body = z.array(fichaEstudiante).min(1).max(campo.TOPE_LOTE).parse(req.body);

    // Una escritura para todo el lote y una lectura para devolverlo, en vez de
    // un `findOneAndUpdate` por fila. Importar un listado de 300 estudiantes
    // eran 300 viajes encadenados a la base; ahora son dos.
    const items = await upsertStudents(body);

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
    if (!dentroDelAlcanceDePrograma(req.alcance!, 'studentIds', req.params.id)) {
      return res.status(403).json({ ok: false, message: 'Estudiante fuera de tus programas' });
    }

    const body = z.object({
      fullName: campo.nombre.min(3).optional(),
      email: campo.correo.optional(),
      program: campo.linea.min(2).optional(),
      photoUrl: campo.url.nullable().optional(),
      attendanceRate: z.number().min(0).max(100).optional(),
      academicPerformance: z.number().min(0).max(5).optional(),
    }).parse(req.body);

    const item = await updateStudent(String(req.params.id), body);
    if (!item) return res.status(404).json({ ok: false, message: 'Not found' });
    emitSync('sync:update', { entity: 'student', action: 'update', id: item.id });
    res.json({ ok: true, item });
  } catch (err) {
    next(err);
  }
});

studentRouter.delete('/:id', requireRole('ADMIN', 'COORDINATOR'), async (req, res, next) => {
  try {
    // Borrar un estudiante arrastra sus notas y su asistencia en todas las
    // materias, incluidas las de carreras que no son de esta coordinación.
    if (!dentroDelAlcanceDePrograma(req.alcance!, 'studentIds', req.params.id)) {
      return res.status(403).json({ ok: false, message: 'Estudiante fuera de tus programas' });
    }
    const item = await softDeleteStudent(String(req.params.id));
    if (!item) return res.status(404).json({ ok: false, message: 'Not found' });
    emitSync('sync:update', { entity: 'student', action: 'delete', id: item.id });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
