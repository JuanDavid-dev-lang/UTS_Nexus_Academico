import { Router } from 'express';
import { identificar, requireRole } from '../../middlewares/auth.js';
import { StudentModel } from '../../models/student.model.js';
import { SubjectModel } from '../../models/subject.model.js';
import { getProfessorScope } from '../../shared/professor-scope.js';
import { computeAcademicRecords, type AcademicFilter, type AcademicRecord } from '../../shared/academic.service.js';

export const analyticsRouter = Router();

analyticsRouter.use(identificar);

/** Construye el filtro académico según el rol (profesor / estudiante / admin). */
async function scopedFilter(req: any): Promise<AcademicFilter> {
  if (req.user?.role === 'PROFESSOR') return { teacherId: req.user.id };
  if (req.user?.role === 'STUDENT') return { studentId: req.user.studentId };
  return {};
}

analyticsRouter.get('/dashboard', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR', 'STUDENT'), async (req, res, next) => {
  try {
    const filter = await scopedFilter(req);
    const records = await computeAcademicRecords(filter);

    // Totales de estudiantes/materias (alcance real por rol).
    let totalStudents: number;
    let totalSubjects: number;
    if (req.user?.role === 'PROFESSOR') {
      const scope = await getProfessorScope(req.user.id);
      totalStudents = scope.studentIds.length;
      totalSubjects = scope.subjectIds.length;
    } else if (req.user?.role === 'STUDENT') {
      totalStudents = 1;
      totalSubjects = new Set(records.map(r => r.subjectId)).size;
    } else {
      [totalStudents, totalSubjects] = await Promise.all([
        StudentModel.countDocuments({ deletedAt: null }),
        SubjectModel.countDocuments({ deletedAt: null }),
      ]);
    }

    // Promedio ACTUAL (parcial): refleja el desempeño con lo ya calificado.
    const conNotas = records.filter(r => r.tieneNotas);
    const averageGrade = conNotas.length
      ? Number((conNotas.reduce((sum, r) => sum + r.riesgo.notaActual, 0) / conNotas.length).toFixed(2))
      : 0;

    // Asistencia: promedio de los porcentajes ponderados por registro.
    const sumaPorcentajes = records.reduce((s, r) => s + r.riesgo.porcentajeAsistencia, 0);
    const averageAttendance = records.length ? Number((sumaPorcentajes / records.length).toFixed(2)) : 0;

    // Agregación a nivel de estudiante (un alumno puede tener varias materias).
    const porEstudiante = new Map<string, { graded: number; failed: number; riesgo: boolean }>();
    for (const r of records) {
      const cur = porEstudiante.get(r.studentId) ?? { graded: 0, failed: 0, riesgo: false };
      if (r.tieneNotas) {
        cur.graded += 1;
        // Proyección con el promedio actual (no la final con ceros).
        if (r.riesgo.notaActual < 3) cur.failed += 1;
      }
      if (r.riesgo.nivel !== 'BAJO') cur.riesgo = true;
      porEstudiante.set(r.studentId, cur);
    }
    const alumnos = [...porEstudiante.values()];
    // Aprobado: tiene notas y ninguna materia perdida. Reprobado: al menos una perdida.
    const approvedStudents = alumnos.filter(s => s.graded > 0 && s.failed === 0).length;
    const failedStudents = alumnos.filter(s => s.failed > 0).length;
    const riskStudents = alumnos.filter(s => s.riesgo).length;

    // Materias críticas: promedio final < 3.0.
    const porMateria = new Map<string, { suma: number; n: number }>();
    for (const r of conNotas) {
      const cur = porMateria.get(r.subjectId) ?? { suma: 0, n: 0 };
      cur.suma += r.riesgo.notaActual;
      cur.n += 1;
      porMateria.set(r.subjectId, cur);
    }
    const criticalSubjects = [...porMateria.values()].filter(m => m.suma / m.n < 3).length;
    const missedClasses = records.reduce((s, r) => s + r.riesgo.clasesAusente, 0);

    res.json({
      ok: true,
      summary: {
        totalStudents,
        totalSubjects,
        averageGrade,
        averageAttendance,
        approvedStudents,
        failedStudents,
        riskStudents,
        criticalSubjects,
        missedClasses,
      },
    });
  } catch (err) {
    next(err);
  }
});

analyticsRouter.get('/risks', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'), async (req, res, next) => {
  try {
    const filter = await scopedFilter(req);
    const records = await computeAcademicRecords(filter);

    // Un registro por estudiante: el peor riesgo entre sus materias.
    const peor = new Map<string, AcademicRecord>();
    for (const r of records) {
      const prev = peor.get(r.studentId);
      if (!prev || r.riesgo.puntaje > prev.riesgo.puntaje) peor.set(r.studentId, r);
    }

    const items = [...peor.values()]
      .filter(r => r.riesgo.nivel !== 'BAJO')
      .map(r => ({
        studentId: r.studentId,
        code: r.code,
        fullName: r.fullName,
        subjectId: r.subjectId,
        notaFinal: r.notaFinal,
        attendanceRate: r.riesgo.porcentajeAsistencia,
        missed: r.riesgo.clasesAusente,
        riskScore: r.riesgo.puntaje,
        level: r.riesgo.nivel === 'ALTO' ? 'HIGH' : r.riesgo.nivel === 'MEDIO' ? 'MEDIUM' : 'LOW',
        motivos: r.riesgo.motivos,
      }))
      .sort((a, b) => b.riskScore - a.riskScore)
      .slice(0, 50);

    res.json({ ok: true, items });
  } catch (err) {
    next(err);
  }
});
