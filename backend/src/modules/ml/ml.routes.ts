import { Router } from 'express';
import { z } from 'zod';
import { auth, requireRole } from '../../middlewares/auth.js';
import { RiskFeedbackModel } from '../../models/risk-feedback.model.js';
import { computeAcademicRecords } from '../../shared/academic.service.js';
import { getProfessorScope } from '../../shared/professor-scope.js';
import { mlStatus, predictRisk, toFeatures, trainModel } from './ml.service.js';

export const mlRouter = Router();
mlRouter.use(auth);

/** Estado y métricas del modelo. */
mlRouter.get('/status', async (_req, res, next) => {
  try {
    res.json({ ok: true, ...(await mlStatus()) });
  } catch (err) {
    next(err);
  }
});

/**
 * Riesgo predicho para el alcance del usuario.
 *
 * Devuelve `source` por estudiante: 'model' si predijo el modelo entrenado,
 * 'rules' si se usó el respaldo. El docente tiene derecho a saberlo.
 */
mlRouter.get('/risk', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'), async (req, res, next) => {
  try {
    const filter = req.user?.role === 'PROFESSOR' ? { teacherId: req.user.id } : {};
    const period = req.query.period ? String(req.query.period) : undefined;

    const records = await computeAcademicRecords({ ...filter, period });
    const predictions = await predictRisk(records);

    // Se cruza con el nombre para que el cliente no tenga que pedirlo aparte.
    const byKey = new Map(records.map(r => [`${r.studentId}:${r.subjectId}`, r]));
    const items = predictions.map(prediction => {
      const record = byKey.get(`${prediction.student_id}:${prediction.subject_id}`);
      return {
        studentId: prediction.student_id,
        subjectId: prediction.subject_id,
        code: record?.code ?? '',
        fullName: record?.fullName ?? '',
        level: prediction.level,
        probability: prediction.probability,
        source: prediction.source,
        reasons: prediction.reasons,
        contributions: prediction.contributions ?? [],
      };
    });

    res.json({ ok: true, items });
  } catch (err) {
    next(err);
  }
});

/**
 * Realimentación del docente sobre una alerta.
 *
 * Es lo que convierte el sistema en algo que aprende: sin esto, el modelo
 * repetiría para siempre lo que aprendió el primer día.
 */
mlRouter.post('/feedback', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'), async (req, res, next) => {
  try {
    const body = z
      .object({
        studentId: z.string().min(1),
        subjectId: z.string().min(1),
        period: z.string().min(4),
        predictedLevel: z.enum(['LOW', 'MEDIUM', 'HIGH']),
        predictedProbability: z.number().min(0).max(1).default(0),
        modelVersion: z.string().default(''),
        teacherVerdict: z.enum(['ACCURATE', 'INACCURATE', 'UNSURE']).default('UNSURE'),
        teacherNote: z.string().max(500).default(''),
        actuallyFailed: z.boolean().nullable().default(null),
        features: z.record(z.any()).default({}),
      })
      .parse(req.body);

    if (req.user?.role === 'PROFESSOR') {
      const scope = await getProfessorScope(req.user.id);
      if (!scope.studentIds.includes(body.studentId)) {
        return res.status(403).json({ ok: false, message: 'Student not assigned' });
      }
    }

    const item = await RiskFeedbackModel.findOneAndUpdate(
      { studentId: body.studentId, subjectId: body.subjectId, period: body.period },
      { $set: { ...body, teacherId: req.user?.id } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.status(201).json({ ok: true, item });
  } catch (err) {
    next(err);
  }
});

/**
 * Reentrena el modelo con los casos ya cerrados.
 *
 * Solo se usan los que tienen desenlace real (`actuallyFailed` definido): una
 * opinión sin resultado no es una etiqueta, y entrenar con ellas enseñaría al
 * modelo a imitar impresiones en vez de hechos.
 */
mlRouter.post('/train', requireRole('ADMIN', 'COORDINATOR'), async (req, res, next) => {
  try {
    const force = req.query.force === '1';

    const closed = await RiskFeedbackModel.find({
      actuallyFailed: { $ne: null },
      deletedAt: null,
    }).lean();

    if (closed.length < 50) {
      return res.status(400).json({
        ok: false,
        message:
          `Solo hay ${closed.length} casos con desenlace real. Se necesitan al menos 50 ` +
          `para entrenar con datos de la institución. Mientras tanto sigue activo el ` +
          `modelo de arranque.`,
        available: closed.length,
        required: 50,
      });
    }

    const examples = closed
      .filter(row => row.features && Object.keys(row.features).length > 0)
      .map(row => ({
        features: row.features as ReturnType<typeof toFeatures>,
        failed: Boolean(row.actuallyFailed),
      }));

    const result = await trainModel(examples, force);
    if (!result.ok) {
      return res.status(502).json({ ok: false, message: result.detail });
    }

    res.json({
      ok: true,
      promoted: result.promoted,
      reason: result.reason,
      samples: examples.length,
    });
  } catch (err) {
    next(err);
  }
});

/** Cuántos casos hay listos para entrenar. */
mlRouter.get('/dataset', requireRole('ADMIN', 'COORDINATOR'), async (_req, res, next) => {
  try {
    const [total, closed] = await Promise.all([
      RiskFeedbackModel.countDocuments({ deletedAt: null }),
      RiskFeedbackModel.countDocuments({ actuallyFailed: { $ne: null }, deletedAt: null }),
    ]);

    res.json({
      ok: true,
      total,
      closed,
      required: 50,
      ready: closed >= 50,
    });
  } catch (err) {
    next(err);
  }
});
