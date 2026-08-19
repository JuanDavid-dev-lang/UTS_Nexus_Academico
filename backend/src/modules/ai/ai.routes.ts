import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import * as campo from '../../shared/validation.js';
import { exigirSesion, identificar, requireRole } from '../../middlewares/auth.js';
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
import { env } from '../../shared/env.js';
import {
  askAssistant,
  checkOllama,
  OllamaUnavailableError,
  type ChatMessage,
} from './assistant.service.js';
import { contextoAgenda, responderAgenda } from './agenda-context.js';
import { pareceDeAgenda } from '../../domains/agenda/agenda-questions.js';

export const aiRouter = Router();
aiRouter.use(identificar);

/**
 * Límite de tasa propio del chat.
 *
 * El cupo general de la API (250 peticiones cada 15 minutos) no sirve aquí:
 * cada mensaje arrastra la agregación académica completa **y** una inferencia
 * del modelo local, que ocupa la CPU o la GPU durante segundos. Doscientas
 * cincuenta de esas dejan la máquina sin atender nada más, incluida la toma de
 * asistencia de quien está en clase en ese momento.
 *
 * Se cuenta por usuario y no por IP porque un campus sale a internet por una
 * sola dirección: contar por IP dejaría a toda la facultad compartiendo el
 * cupo de quien más pregunte.
 */
const limiteChat = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  // `requireRole` va delante en la ruta, así que aquí siempre hay usuario; el
  // respaldo por IP solo existe para no dejar la clave vacía si eso cambiara.
  keyGenerator: (req) => req.user?.id ?? req.ip ?? 'anonimo',
  message: {
    ok: false,
    message: 'Has hecho muchas consultas al asistente. Espera unos minutos antes de seguir.',
  },
});

/** Estado del asistente de IA local (Ollama): ¿está activo y disponible? */
// `exigirSesion`: contar si hay un servicio de IA local encendido y con qué
// modelo es reconocimiento gratis para quien no ha iniciado sesión.
aiRouter.get('/status', exigirSesion, async (_req, res) => {
  if (!env.AI_ENABLED) {
    return res.json({ ok: true, enabled: false, available: false, message: 'IA desactivada (AI_ENABLED=0).' });
  }
  const status = await checkOllama();
  res.json({
    ok: true,
    enabled: true,
    available: status.ok,
    model: env.AI_MODEL,
    baseUrl: env.AI_BASE_URL,
    models: status.models,
    modelReady: status.models.some(m => m === env.AI_MODEL || m.startsWith(env.AI_MODEL.split(':')[0])),
    error: status.error,
  });
});

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

aiRouter.post('/chat', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'), limiteChat, async (req, res, next) => {
  try {
    const body = z.object({
      // Dos mil caracteres son cuatro párrafos largos: de sobra para cualquier
      // pregunta real. Sin tope, el cuerpo entero de la petición —hasta 2 MB—
      // se volcaba al prompt de Ollama, que no lo rechaza: lo intenta cargar y
      // deja al proceso sin memoria o esperando hasta el corte del minuto.
      message: z.string().trim().min(1).max(2000),
      studentId: campo.codigo.optional(),
      subjectId: campo.codigo.optional(),
      groupId: campo.codigo.optional(),
      // El historial lo manda el cliente, así que también se acota: seis turnos
      // es lo que el servicio usa, y cada uno cabe en un mensaje del chat.
      history: z.array(z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().max(4000),
      })).max(20).optional(),
    }).parse(req.body);

    // Aislamiento: un docente solo consulta lo suyo.
    let teacherId: string | undefined;
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
      teacherId = req.user.id;
    }

    const alcanceAgenda = { userId: req.user!.id, role: req.user!.role };

    // La agenda se calcula aquí, con los datos reales, y se le entrega al
    // modelo ya resuelta. Solo cuando la pregunta lo pide: cargar el horario en
    // cada mensaje sería una consulta de más por cada "¿cómo va el grupo?".
    const preguntaDeAgenda = pareceDeAgenda(body.message);
    const bloqueAgenda = preguntaDeAgenda ? await contextoAgenda(alcanceAgenda) : undefined;

    // ── Camino principal: IA local (Ollama) con contexto académico real ────
    if (env.AI_ENABLED) {
      try {
        const answer = await askAssistant(
          body.message,
          {
            teacherId,
            studentId: body.studentId,
            subjectId: body.subjectId,
            period: undefined,
            role: req.user?.role,
          },
          (body.history ?? []) as ChatMessage[],
          bloqueAgenda,
        );
        return res.json({ ok: true, answer, source: 'ollama', model: env.AI_MODEL });
      } catch (err) {
        if (!(err instanceof OllamaUnavailableError)) throw err;
        // IA local caída → continúa al modo reglas más abajo.
        console.warn('[ai/chat] IA local no disponible, usando modo reglas:', err.message);
      }
    }

    // ── Fallback determinista (modo reglas, sin IA) ────────────────────────
    const message = body.message.toLowerCase();
    const fallbackNote = 'ⓘ IA local no disponible; respuesta básica por reglas.';

    // El horario es lo único que se responde igual de bien sin modelo: sale de
    // la agenda real, no de una redacción. Va primero por eso.
    if (preguntaDeAgenda) {
      const respuesta = await responderAgenda(body.message, alcanceAgenda);
      if (respuesta) {
        return res.json({ ok: true, source: 'rules', answer: `${respuesta}\n\n${fallbackNote}` });
      }
    }

    if (message.includes('promedio') && body.studentId && body.subjectId) {
      const grades = await GradeModel.find({ studentId: body.studentId, subjectId: body.subjectId, deletedAt: null }).lean();
      const avg = grades.length ? grades.reduce((s, g) => s + g.score, 0) / grades.length : 0;
      return res.json({ ok: true, answer: `Promedio: ${avg.toFixed(2)}\n${fallbackNote}`, source: 'rules' });
    }

    if ((message.includes('riesgo') || message.includes('peligro')) && body.subjectId) {
      const students = req.user?.role === 'PROFESSOR'
        ? await StudentModel.find({ deletedAt: null, _id: { $in: (await getProfessorScope(req.user.id)).studentIds } }).lean()
        : await StudentModel.find({ deletedAt: null }).lean();
      return res.json({
        ok: true,
        source: 'rules',
        answer: `Riesgo evaluado para ${students.length} estudiantes. Usa /ai/predict por estudiante.\n${fallbackNote}`,
      });
    }

    return res.json({
      ok: true,
      source: 'rules',
      answer: `Puedo calcular promedio, notas necesarias, asistencia y riesgo. Envía studentId y subjectId para precisión.\n${fallbackNote}`,
    });
  } catch (err) {
    next(err);
  }
});
