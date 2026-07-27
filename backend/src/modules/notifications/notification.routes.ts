import { Router } from 'express';
import { z } from 'zod';
import { NotificationModel } from '../../models/notification.model.js';
import { auth, requireRole } from '../../middlewares/auth.js';
import { emitSync, emitToUser } from '../../shared/socket.js';
import { generateRiskNotifications } from './risk-notifier.service.js';

export const notificationRouter = Router();
notificationRouter.use(auth);

notificationRouter.get('/', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR', 'STUDENT'), async (_req, res, next) => {
  try {
    const filter: Record<string, unknown> = { deletedAt: null };
    // Docente y estudiante solo ven sus propias notificaciones.
    if (_req.user?.role === 'PROFESSOR' || _req.user?.role === 'STUDENT') filter.userId = _req.user.id;
    const items = await NotificationModel.find(filter).sort({ createdAt: -1 }).limit(200).lean();
    res.json({ ok: true, items });
  } catch (err) {
    next(err);
  }
});

// Dispara el escaneo de riesgo bajo demanda (el profesor solo sobre sus grupos).
notificationRouter.post('/risks/scan', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'), async (req, res, next) => {
  try {
    const period = req.query.period ? String(req.query.period) : undefined;
    const result = await generateRiskNotifications({
      teacherId: req.user?.role === 'PROFESSOR' ? req.user.id : undefined,
      period,
    });
    res.json({ ok: true, ...result });
  } catch (err) {
    next(err);
  }
});

notificationRouter.post('/', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'), async (req, res, next) => {
  try {
    const body = z.object({
      userId: z.string(),
      title: z.string().min(1),
      message: z.string().min(1),
      type: z.enum(['CLASS', 'GRADE', 'RISK', 'ATTENDANCE', 'ACTIVITY', 'EXAM', 'DEADLINE']),
      channel: z.enum(['PUSH', 'EMAIL', 'IN_APP']).default('IN_APP'),
      metadata: z.record(z.any()).optional(),
    }).parse(req.body);
    if (req.user?.role === 'PROFESSOR' && body.userId !== req.user.id) {
      return res.status(403).json({ ok: false, message: 'Forbidden' });
    }
    const item = await NotificationModel.create(body);
    emitSync('sync:update', { entity: 'notification', action: 'create', id: item.id });
    res.status(201).json({ ok: true, item });
  } catch (err) {
    next(err);
  }
});

notificationRouter.patch('/:id/read', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR', 'STUDENT'), async (req, res, next) => {
  try {
    const filter: Record<string, unknown> = { _id: req.params.id, deletedAt: null };
    // Docente/estudiante solo pueden marcar como leídas las suyas.
    if (req.user?.role === 'PROFESSOR' || req.user?.role === 'STUDENT') filter.userId = req.user.id;
    const item = await NotificationModel.findOneAndUpdate(
      filter,
      { $set: { readAt: new Date() } },
      { new: true }
    );
    if (!item) return res.status(404).json({ ok: false, message: 'Not found' });
    emitToUser(String(item.userId), 'sync:update', { entity: 'notification', action: 'read', id: item.id });
    res.json({ ok: true, item });
  } catch (err) {
    next(err);
  }
});
