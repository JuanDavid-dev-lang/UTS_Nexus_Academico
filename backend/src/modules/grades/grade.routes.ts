import { Router } from 'express';
import { z } from 'zod';
import { exigirPeriodoAbierto } from '../../shared/period-guard.js';
import * as campo from '../../shared/validation.js';
import { GradeModel } from '../../models/grade.model.js';
import { StudentModel } from '../../models/student.model.js';
import { SubjectModel } from '../../models/subject.model.js';
import { EnrollmentModel } from '../../models/enrollment.model.js';
import { identificar, requireRole } from '../../middlewares/auth.js';
import { auditChange } from '../../shared/audit.js';
import { emitToUser } from '../../shared/socket.js';
import { getProfessorScope } from '../../shared/professor-scope.js';
import { filtroDeListado } from '../../domains/scope/professor-scope.js';
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
    // Una sola función para el acotado por rol, compartida con asistencia: el
    // ámbito del rol se aplica DESPUÉS de lo que pide la URL. Escrito al revés
    // —como estaba aquí— un estudiante recuperaba las notas de otro pasando
    // `?studentId=` y la respuesta era un 200 con una lista impecable.
    const filter = filtroDeListado(req.query, req.user);
    const pagina = campo.paginacionCon(1000).parse(req.query);
    const { skip, limit } = campo.saltoYTope(pagina);
    const [items, total] = await Promise.all([
      GradeModel.find(filter).sort({ studentId: 1, corte: 1 }).skip(skip).limit(limit).lean(),
      GradeModel.countDocuments(filter),
    ]);
    res.json(campo.respuestaPaginada(items, total, pagina));
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

/**
 * Qué falta por calificar, por materia y corte.
 *
 * El motor ya distinguía «0.0» de «sin calificar» —`calcularPromedioParcial`
 * renormaliza sobre los cortes con nota justamente para eso— pero esa
 * información se usaba solo para no dar falsos positivos de riesgo y después se
 * tiraba. Un docente no persigue promedios: persigue el cierre de corte, y la
 * pregunta que se hace en esa semana es «¿qué me falta?».
 *
 * Se cuenta sobre los MATRICULADOS, no sobre quienes ya tienen alguna nota: un
 * estudiante sin ninguna nota es precisamente el que no puede faltar de esta
 * lista, y contar sobre las notas existentes lo haría invisible.
 */
gradeRouter.get('/pendientes', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'), async (req, res, next) => {
  try {
    const query = z.object({
      period: z.string().min(4),
      subjectId: z.string().optional(),
    }).parse(req.query);

    const matriculaFiltro: Record<string, unknown> = {
      deletedAt: null,
      period: query.period,
      enrollmentStatus: 'ACTIVE',
    };
    if (query.subjectId) matriculaFiltro.subjectId = query.subjectId;
    if (req.user?.role === 'PROFESSOR') matriculaFiltro.professorId = req.user.id;

    const matriculas = await EnrollmentModel.find(matriculaFiltro)
      .select('studentId subjectId')
      .lean();

    if (!matriculas.length) {
      return res.json({ ok: true, period: query.period, items: [] });
    }

    const subjectIds = [...new Set(matriculas.map(m => String(m.subjectId)))];

    const notasFiltro: Record<string, unknown> = {
      deletedAt: null,
      period: query.period,
      subjectId: { $in: subjectIds },
    };
    if (req.user?.role === 'PROFESSOR') notasFiltro.teacherId = req.user.id;

    const [notas, materias] = await Promise.all([
      GradeModel.find(notasFiltro).select('studentId subjectId corte componentType').lean(),
      SubjectModel.find({ _id: { $in: subjectIds } }).select('name code').lean(),
    ]);

    const nombrePorMateria = new Map(materias.map(m => [String(m._id), m]));

    // Clave (materia|estudiante|corte|componente) -> ya tiene al menos una nota.
    const calificado = new Set(
      notas.map(n => `${String(n.subjectId)}|${String(n.studentId)}|${n.corte}|${n.componentType}`)
    );

    const estudiantesPorMateria = new Map<string, Set<string>>();
    for (const matricula of matriculas) {
      const clave = String(matricula.subjectId);
      if (!estudiantesPorMateria.has(clave)) estudiantesPorMateria.set(clave, new Set());
      estudiantesPorMateria.get(clave)!.add(String(matricula.studentId));
    }

    const componentes: ComponenteTipo[] = ['TRABAJOS', 'PARCIALES', 'AUTOEVALUACION'];
    const cortes: CorteNumero[] = [1, 2, 3];

    const items = subjectIds
      .map(subjectId => {
        const estudiantes = [...(estudiantesPorMateria.get(subjectId) ?? [])];
        const materia = nombrePorMateria.get(subjectId);

        const detalle = cortes.map(corte => {
          const porComponente = componentes.map(tipo => {
            const faltan = estudiantes.filter(
              studentId => !calificado.has(`${subjectId}|${studentId}|${corte}|${tipo}`)
            ).length;
            return { componente: tipo, faltan, total: estudiantes.length };
          });
          return {
            corte,
            faltan: porComponente.reduce((sum, c) => sum + c.faltan, 0),
            componentes: porComponente,
          };
        });

        return {
          subjectId,
          name: materia?.name ?? 'Materia',
          code: materia?.code ?? '',
          matriculados: estudiantes.length,
          faltan: detalle.reduce((sum, c) => sum + c.faltan, 0),
          cortes: detalle,
        };
      })
      // Primero la materia con más trabajo pendiente: es por donde hay que empezar.
      .sort((a, b) => b.faltan - a.faltan || a.name.localeCompare(b.name));

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

    // Un periodo cerrado ya tiene fotografía oficial: admitir una nota más la
    // desmentiría sin que nadie se enterara. 409, no 500.
    await exigirPeriodoAbierto(body.period, 'grade');

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
    if (before?.period) await exigirPeriodoAbierto(String(before.period), 'grade');
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
    if (before?.period) await exigirPeriodoAbierto(String(before.period), 'grade');
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
