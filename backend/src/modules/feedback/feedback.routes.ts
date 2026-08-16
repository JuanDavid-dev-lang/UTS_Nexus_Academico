import { Router } from 'express';
import { z } from 'zod';
import { FeedbackModel } from '../../models/feedback.model.js';
import { identificar, requireRole } from '../../middlewares/auth.js';
import { auditChange } from '../../shared/audit.js';
import { emitToUser } from '../../shared/socket.js';
import { crearNotificacion } from '../../shared/notify.js';

/**
 * Buzón de sugerencias y reportes de error de la aplicación.
 *
 * El docente escribe, la administración revisa — el flujo inverso a los
 * avisos. Los eventos van por `emitToUser` (que incluye las salas ADMIN y
 * COORDINATOR): el feedback de un docente no le incumbe al resto de docentes,
 * así que no hay broadcast.
 */
export const feedbackRouter = Router();
feedbackRouter.use(identificar);

const cuerpo = z.object({
  tipo: z.enum(['SUGERENCIA', 'ERROR']).default('SUGERENCIA'),
  mensaje: z
    .string()
    .trim()
    .min(10, 'Cuenta un poco más: con menos de 10 caracteres no hay qué revisar.')
    .max(2000),
  origen: z.enum(['DESKTOP', 'MOBILE']).default('DESKTOP'),
  appVersion: z.string().trim().max(40).optional(),
});

const ESTADOS = ['NUEVO', 'EN_REVISION', 'RESUELTO', 'DESCARTADO'] as const;

feedbackRouter.post('/', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'), async (req, res, next) => {
  try {
    const datos = cuerpo.parse(req.body);

    // El autor sale de la sesión, nunca del body: nadie envía a nombre de otro.
    const item = await FeedbackModel.create({ ...datos, autorId: req.user?.id });

    await auditChange({
      actorId: req.user?.id,
      action: 'CREATE',
      entity: 'FeedbackApp',
      entityId: item.id,
      after: item.toObject(),
    });
    emitToUser(String(req.user?.id), 'sync:update', { entity: 'feedback', action: 'create', id: item.id });
    res.status(201).json({ ok: true, item });
  } catch (err) {
    next(err);
  }
});

/**
 * Bandeja. La administración ve todo; un docente, solo lo suyo — el buzón no
 * es un foro y lo que reportó otro no es asunto de nadie más.
 */
feedbackRouter.get('/', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'), async (req, res, next) => {
  try {
    const esGestor = req.user?.role === 'ADMIN' || req.user?.role === 'COORDINATOR';
    const filtro: Record<string, unknown> = { deletedAt: null };
    if (!esGestor) filtro.autorId = req.user?.id;
    if (req.query.estado && ESTADOS.includes(String(req.query.estado) as (typeof ESTADOS)[number])) {
      filtro.estado = String(req.query.estado);
    }
    if (req.query.tipo === 'SUGERENCIA' || req.query.tipo === 'ERROR') {
      filtro.tipo = String(req.query.tipo);
    }

    const items = await FeedbackModel.find(filtro)
      .populate('autorId', 'fullName')
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();
    res.json({ ok: true, items });
  } catch (err) {
    next(err);
  }
});

/** Cambio de estado (solo ADMIN). Al resolver o descartar se avisa al autor. */
feedbackRouter.patch('/:id', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const { estado } = z.object({ estado: z.enum(ESTADOS) }).parse(req.body);

    const antes = await FeedbackModel.findOne({ _id: req.params.id, deletedAt: null }).lean();
    if (!antes) return res.status(404).json({ ok: false, message: 'Sugerencia no encontrada.' });

    const item = await FeedbackModel.findOneAndUpdate(
      { _id: req.params.id, deletedAt: null },
      { $set: { estado, revisadoPor: req.user?.id } },
      { new: true }
    );
    if (!item) return res.status(404).json({ ok: false, message: 'Sugerencia no encontrada.' });

    await auditChange({
      actorId: req.user?.id,
      action: 'UPDATE',
      entity: 'FeedbackApp',
      entityId: item.id,
      before: antes,
      after: item.toObject(),
    });
    emitToUser(String(item.autorId), 'sync:update', { entity: 'feedback', action: 'update', id: item.id });

    // Avisar al autor solo cuando hay un desenlace: los estados intermedios
    // son cocina interna y notificarlos enseña a ignorar la campana.
    if (estado === 'RESUELTO' || estado === 'DESCARTADO') {
      await crearNotificacion({
        userId: String(item.autorId),
        title: estado === 'RESUELTO' ? 'Tu sugerencia fue resuelta' : 'Tu sugerencia fue revisada',
        message:
          estado === 'RESUELTO'
            ? 'Gracias por reportarlo: ya está atendido.'
            : 'Se revisó y no se aplicará por ahora. Gracias por escribir.',
        type: 'SISTEMA',
        dedupeKey: `feedback:${item.id}:${estado}`,
        metadata: { feedbackId: item.id },
      });
    }

    res.json({ ok: true, item });
  } catch (err) {
    next(err);
  }
});

feedbackRouter.delete('/:id', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const item = await FeedbackModel.findOneAndUpdate(
      { _id: req.params.id, deletedAt: null },
      { $set: { deletedAt: new Date(), status: 'DELETED' } },
      { new: true }
    );
    if (!item) return res.status(404).json({ ok: false, message: 'Sugerencia no encontrada.' });

    await auditChange({ actorId: req.user?.id, action: 'DELETE', entity: 'FeedbackApp', entityId: item.id });
    emitToUser(String(item.autorId), 'sync:update', { entity: 'feedback', action: 'delete', id: item.id });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
