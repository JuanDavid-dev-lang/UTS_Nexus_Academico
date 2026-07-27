import { Router } from 'express';
import { z } from 'zod';
import { auth, requireRole } from '../../middlewares/auth.js';
import { GradeModel } from '../../models/grade.model.js';
import { AttendanceModel } from '../../models/attendance.model.js';
import { StudentModel } from '../../models/student.model.js';
import { PredictionModel } from '../../models/prediction.model.js';
import { getProfessorScope } from '../../shared/professor-scope.js';
import {
  calcularNotaFinal,
  type NotaComponente,
  type CorteNumero,
  type ComponenteTipo,
} from '../../domains/grading/grading.service.js';
import { evaluarRiesgo } from '../../domains/risk/risk.service.js';

export const aiRouter = Router();
aiRouter.use(auth);

aiRouter.post('/predict', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'), async (req, res, next) => {
  try {
    const body = z.object({
      studentId: z.string(),
      subjectId: z.string(),
      passingGrade: z.number().min(0).max(5).default(3),
      targetGrade: z.number().min(0).max(5).default(3),
    }).parse(req.body);
    if (req.user?.role === 'PROFESSOR') {
      const scope = await getProfessorScope(req.user.id);
      if (!scope.subjectIds.includes(body.subjectId)) return res.status(403).json({ ok: false, message: 'Subject not assigned' });
      if (!scope.studentIds.includes(body.studentId)) return res.status(403).json({ ok: false, message: 'Student not assigned' });
    }

    const [grades, attendance, student] = await Promise.all([
      GradeModel.find({ studentId: body.studentId, subjectId: body.subjectId, deletedAt: null }).lean(),
      AttendanceModel.find({ studentId: body.studentId, subjectId: body.subjectId, deletedAt: null }).lean(),
      StudentModel.findById(body.studentId).lean(),
    ]);

    // Usa el motor canónico: nada de fórmulas paralelas.
    const notas: NotaComponente[] = grades
      .filter(g => (g.corte === 1 || g.corte === 2 || g.corte === 3) && !!g.componentType)
      .map(g => ({ corte: g.corte as CorteNumero, tipo: g.componentType as ComponenteTipo, score: Number(g.score ?? 0) }));
    const resumen = calcularNotaFinal(notas);
    const riesgo = evaluarRiesgo({
      notas,
      asistencia: attendance.map(a => ({ present: a.present, durationMinutes: a.durationMinutes })),
    });

    const currentAverage = resumen.notaFinal;
    const attendanceRate = riesgo.porcentajeAsistencia;
    const needed = Math.max(0, Number((body.passingGrade - currentAverage).toFixed(2)));
    const riskLevel = riesgo.nivel === 'ALTO' ? 'HIGH' : riesgo.nivel === 'MEDIO' ? 'MEDIUM' : 'LOW';

    const result = {
      studentId: body.studentId,
      subjectId: body.subjectId,
      studentName: student?.fullName ?? 'Estudiante',
      currentAverage: Number(currentAverage.toFixed(2)),
      attendanceRate: Number(attendanceRate.toFixed(2)),
      neededToPass: needed,
      riskLevel,
      scenarios: [2, 3, 4, 5].map(score => ({
        score,
        finalAverage: Number((currentAverage + (score - currentAverage) * 0.5).toFixed(2)),
      })),
      recommendations: [
        attendanceRate < 85 ? 'Mejorar asistencia semanal.' : 'Asistencia estable.',
        needed > 0 ? 'Reforzar evaluaciones futuras.' : 'Rendimiento suficiente.',
      ],
    };

    await PredictionModel.create({
      studentId: body.studentId,
      subjectId: body.subjectId,
      teacherId: req.user?.id ?? body.studentId,
      riskLevel,
      neededToPass: needed,
      scenario: result.scenarios,
      rationale: result.recommendations.join(' '),
    });

    res.json({ ok: true, result });
  } catch (err) {
    next(err);
  }
});

aiRouter.post('/chat', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'), async (req, res, next) => {
  try {
    const body = z.object({
      message: z.string().min(1),
      studentId: z.string().optional(),
      subjectId: z.string().optional(),
      groupId: z.string().optional(),
    }).parse(req.body);

    if (req.user?.role === 'PROFESSOR') {
      const scope = await getProfessorScope(req.user.id);
      if (body.subjectId && !scope.subjectIds.includes(body.subjectId)) {
        return res.status(403).json({ ok: false, message: 'Subject not assigned' });
      }
      if (body.studentId && !scope.studentIds.includes(body.studentId)) {
        return res.status(403).json({ ok: false, message: 'Student not assigned' });
      }
      if (body.groupId && !scope.groupIds.includes(body.groupId)) {
        return res.status(403).json({ ok: false, message: 'Group not assigned' });
      }
    }

    const message = body.message.toLowerCase();

    if (message.includes('promedio') && body.studentId && body.subjectId) {
      const grades = await GradeModel.find({ studentId: body.studentId, subjectId: body.subjectId, deletedAt: null }).lean();
      const avg = grades.length ? grades.reduce((s, g) => s + g.score, 0) / grades.length : 0;
      return res.json({ ok: true, answer: `Promedio: ${avg.toFixed(2)}` });
    }

    if ((message.includes('riesgo') || message.includes('peligro')) && body.subjectId) {
      const students = req.user?.role === 'PROFESSOR'
        ? await StudentModel.find({ deletedAt: null, _id: { $in: (await getProfessorScope(req.user.id)).studentIds } }).lean()
        : await StudentModel.find({ deletedAt: null }).lean();
      return res.json({
        ok: true,
        answer: `Riesgo evaluado para ${students.length} estudiantes. Usa /ai/predict por estudiante.`,
      });
    }

    return res.json({
      ok: true,
      answer: 'Puedo calcular promedio, notas necesarias, asistencia y riesgo. Envía studentId y subjectId para precisión.',
    });
  } catch (err) {
    next(err);
  }
});
