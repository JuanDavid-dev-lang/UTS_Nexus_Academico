import { Router } from 'express';
import { z } from 'zod';
import { identificar, requireRole } from '../../middlewares/auth.js';
import { StudentModel } from '../../models/student.model.js';
import { SubjectModel } from '../../models/subject.model.js';
import { RiskFeedbackModel } from '../../models/risk-feedback.model.js';
import { getProfessorScope } from '../../shared/professor-scope.js';
import { emitToUser } from '../../shared/socket.js';
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

/**
 * Anota qué se hizo con un estudiante en riesgo.
 *
 * Convierte el tablero en un seguimiento: sin esto el docente no tenía dónde
 * dejar constancia de que ya había hablado con alguien, y la lista repetía los
 * mismos nombres cada semana sin distinguir el caso nuevo del ya atendido.
 *
 * Escribe sobre el mismo documento que usa la realimentación del modelo —un
 * caso por (estudiante, materia, periodo)— porque es el mismo caso: qué predijo
 * el sistema, qué hizo el docente y cómo terminó. Separarlo en dos colecciones
 * obligaría a cruzarlas para responder «¿funcionó lo que hicimos?».
 */
analyticsRouter.patch('/risks/intervencion', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'), async (req, res, next) => {
  try {
    const body = z.object({
      studentId: z.string(),
      subjectId: z.string(),
      period: z.string().min(4),
      estado: z.enum(['PENDIENTE', 'CONTACTADO', 'CITA_ACORDADA', 'NO_RESPONDE', 'RESUELTO']),
      nota: z.string().max(500).default(''),
    }).parse(req.body);

    // Un docente solo anota sobre sus propios estudiantes y materias. Sin esta
    // comprobación, el seguimiento sería una vía para escribir en el expediente
    // de un estudiante ajeno.
    if (req.user?.role === 'PROFESSOR') {
      const scope = await getProfessorScope(req.user.id);
      if (!scope.studentIds.includes(body.studentId) || !scope.subjectIds.includes(body.subjectId)) {
        return res.status(403).json({ ok: false, message: 'Fuera de tu alcance' });
      }
    }

    const item = await RiskFeedbackModel.findOneAndUpdate(
      { studentId: body.studentId, subjectId: body.subjectId, period: body.period },
      {
        $set: {
          interventionStatus: body.estado,
          interventionNote: body.nota,
          interventionAt: new Date(),
          interventionBy: req.user?.id,
          teacherId: req.user?.id,
        },
        // Solo al crear: si el caso ya existe porque el modelo lo registró, su
        // predicción original no debe reescribirse con un valor de relleno.
        $setOnInsert: { predictedLevel: 'MEDIUM' },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    emitToUser(String(req.user?.id), 'sync:update', {
      entity: 'risk',
      action: 'update',
      id: String(item?._id ?? body.studentId),
    });

    res.json({ ok: true, item });
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

    const enRiesgo = [...peor.values()]
      .filter(r => r.riesgo.nivel !== 'BAJO')
      .sort((a, b) => b.riesgo.puntaje - a.riesgo.puntaje)
      .slice(0, 50);

    /*
     * Seguimiento ya anotado sobre cada caso. Va en la misma respuesta para que
     * la lista distinga "aún no lo he mirado" de "llevo un mes detrás": sin eso
     * el tablero informaba lo mismo cada semana y no había forma de saber cuál
     * ya estaba atendido.
     */
    const seguimientos = await RiskFeedbackModel.find({
      deletedAt: null,
      studentId: { $in: enRiesgo.map(r => r.studentId) },
    })
      .select('studentId subjectId interventionStatus interventionNote interventionAt')
      .lean();

    const porCaso = new Map(
      seguimientos.map(s => [`${String(s.studentId)}|${String(s.subjectId)}`, s])
    );

    const items = enRiesgo.map(r => {
      const seguimiento = porCaso.get(`${r.studentId}|${r.subjectId}`);
      return {
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
        interventionStatus: seguimiento?.interventionStatus ?? 'PENDIENTE',
        interventionNote: seguimiento?.interventionNote ?? '',
        interventionAt: seguimiento?.interventionAt ?? null,
      };
    });

    res.json({ ok: true, items });
  } catch (err) {
    next(err);
  }
});
