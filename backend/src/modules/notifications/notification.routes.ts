import { Router } from 'express';
import { z } from 'zod';
import { NotificationModel } from '../../models/notification.model.js';
import { DeviceModel } from '../../models/device.model.js';
import { NotificationPreferenceModel } from '../../models/notification-preference.model.js';
import { identificar, requireRole } from '../../middlewares/auth.js';
import { emitToUser } from '../../shared/socket.js';
import { crearNotificacion, obtenerPreferencias, normalizarPreferencias } from '../../shared/notify.js';
import { pushConfigurado } from '../../shared/push.js';
import { normalizarAntelaciones } from '../../domains/agenda/agenda.service.js';
import { generateRiskNotifications } from './risk-notifier.service.js';
import { generarRecordatorios } from './class-reminder.service.js';
import { notificarVersionNueva } from './release-notifier.service.js';

export const notificationRouter = Router();
notificationRouter.use(identificar);

const TODOS = ['ADMIN', 'PROFESSOR', 'COORDINATOR', 'STUDENT'] as const;

const listadoSchema = z.object({
  /** `unread` deja solo las pendientes; `all` (por defecto) no filtra. */
  estado: z.enum(['all', 'unread']).default('all'),
  priority: z.enum(['URGENT', 'IMPORTANT', 'INFO', 'SYSTEM']).optional(),
  type: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

notificationRouter.get('/', requireRole(...TODOS), async (req, res, next) => {
  try {
    const query = listadoSchema.parse(req.query);
    const filter: Record<string, unknown> = { deletedAt: null };
    // Docente y estudiante solo ven sus propias notificaciones.
    if (req.user?.role === 'PROFESSOR' || req.user?.role === 'STUDENT') filter.userId = req.user.id;
    if (query.estado === 'unread') filter.readAt = null;
    if (query.priority) filter.priority = query.priority;
    if (query.type) filter.type = query.type;

    const items = await NotificationModel.find(filter).sort({ createdAt: -1 }).limit(query.limit).lean();
    res.json({ ok: true, items });
  } catch (err) {
    next(err);
  }
});

// ── Preferencias ─────────────────────────────────────────────────────────────

notificationRouter.get('/preferences', requireRole(...TODOS), async (req, res, next) => {
  try {
    const preferencias = await obtenerPreferencias(req.user!.id);
    res.json({
      ok: true,
      preferences: preferencias,
      // El cliente necesita saberlo para decir la verdad en la pantalla de
      // ajustes: "las notificaciones con la app cerrada no están configuradas
      // en este servidor" es información, "activado" a secas sería mentira.
      pushConfigurado: pushConfigurado(),
    });
  } catch (err) {
    next(err);
  }
});

const preferenciasSchema = z.object({
  clases: z.boolean().optional(),
  evaluaciones: z.boolean().optional(),
  asistencia: z.boolean().optional(),
  riesgo: z.boolean().optional(),
  intervenciones: z.boolean().optional(),
  eventos: z.boolean().optional(),
  recordatorios: z.boolean().optional(),
  sincronizacion: z.boolean().optional(),
  sistema: z.boolean().optional(),
  inApp: z.boolean().optional(),
  push: z.boolean().optional(),
  email: z.boolean().optional(),
  classLeadMinutes: z.array(z.number().int().min(0).max(10080)).optional(),
  quietHours: z
    .object({
      enabled: z.boolean().optional(),
      start: z.string().regex(/^\d{2}:\d{2}$/).optional(),
      end: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    })
    .optional(),
  urgentBypassesQuietHours: z.boolean().optional(),
});

notificationRouter.put('/preferences', requireRole(...TODOS), async (req, res, next) => {
  try {
    const body = preferenciasSchema.parse(req.body);
    const cambios: Record<string, unknown> = { ...body };
    if (body.classLeadMinutes) cambios.classLeadMinutes = normalizarAntelaciones(body.classLeadMinutes);
    // `quietHours` se fusiona campo a campo: un PUT con solo `enabled` no debe
    // borrar la franja que el usuario ya había elegido.
    if (body.quietHours) {
      delete cambios.quietHours;
      for (const [clave, valor] of Object.entries(body.quietHours)) {
        if (valor !== undefined) cambios[`quietHours.${clave}`] = valor;
      }
    }

    const documento = await NotificationPreferenceModel.findOneAndUpdate(
      { userId: req.user!.id },
      { $set: cambios, $setOnInsert: { userId: req.user!.id } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean();

    const preferencias = normalizarPreferencias(documento as Record<string, unknown> | null);
    // El otro dispositivo del mismo usuario tiene que reprogramar sus alarmas
    // locales: cambiar la antelación en PC y que el teléfono siga avisando a
    // los 15 minutos sería exactamente el desfase que esto viene a evitar.
    emitToUser(req.user!.id, 'sync:update', { entity: 'preferences', action: 'update', id: req.user!.id });
    res.json({ ok: true, preferences: preferencias, pushConfigurado: pushConfigurado() });
  } catch (err) {
    next(err);
  }
});

// ── Dispositivos (push) ──────────────────────────────────────────────────────

const dispositivoSchema = z.object({
  token: z.string().min(20).max(4096),
  platform: z.enum(['ANDROID', 'IOS', 'WEB', 'DESKTOP']).default('ANDROID'),
  deviceName: z.string().max(120).default(''),
  appVersion: z.string().max(40).default(''),
  /** El cliente programa sus propios recordatorios de clase (alarmas locales). */
  localClassReminders: z.boolean().default(false),
});

notificationRouter.post('/devices', requireRole(...TODOS), async (req, res, next) => {
  try {
    const body = dispositivoSchema.parse(req.body);

    // El token cambia de dueño si reaparece bajo otra cuenta: en un teléfono
    // compartido, el docente nuevo no puede heredar las alertas del anterior.
    const item = await DeviceModel.findOneAndUpdate(
      { token: body.token },
      {
        $set: {
          userId: req.user!.id,
          platform: body.platform,
          deviceName: body.deviceName,
          appVersion: body.appVersion,
          localClassReminders: body.localClassReminders,
          lastSeenAt: new Date(),
          deletedAt: null,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    res.status(201).json({ ok: true, item: { _id: item._id, platform: item.platform } });
  } catch (err) {
    next(err);
  }
});

notificationRouter.delete('/devices', requireRole(...TODOS), async (req, res, next) => {
  try {
    const body = z.object({ token: z.string().min(10) }).parse(req.body);
    // Solo el dueño puede darlo de baja: si no, cerrar sesión en un teléfono
    // permitiría desactivar el de otra persona conociendo su token.
    await DeviceModel.deleteOne({ token: body.token, userId: req.user!.id });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ── Escaneos y disparadores ──────────────────────────────────────────────────

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

/**
 * Ejecuta una pasada de recordatorios de agenda a mano.
 *
 * Existe para poder diagnosticar sin esperar al temporizador ("¿por qué no me
 * llegó el aviso?"). Solo ADMIN: la pasada es global y crea notificaciones para
 * todos los docentes con clase en la ventana.
 */
notificationRouter.post('/agenda/scan', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const ventana = z.coerce.number().int().min(1).max(1440).default(1).parse(req.query.ventana ?? 1);
    const resultado = await generarRecordatorios(new Date(), ventana);
    res.json({ ok: true, ...resultado });
  } catch (err) {
    next(err);
  }
});

/**
 * Comprueba si hay versión nueva y avisa al claustro.
 *
 * Solo ADMIN: manda un correo a todos los docentes aprobados, y eso no es una
 * acción que deba poder disparar cualquiera. Existe además del temporizador
 * para poder anunciar una publicación en el momento, sin esperar al ciclo.
 */
notificationRouter.post('/version/check', requireRole('ADMIN'), async (_req, res, next) => {
  try {
    const result = await notificarVersionNueva();
    res.json({ ok: true, ...result });
  } catch (err) {
    next(err);
  }
});

// ── Alta manual ──────────────────────────────────────────────────────────────

notificationRouter.post('/', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'), async (req, res, next) => {
  try {
    const body = z
      .object({
        userId: z.string(),
        title: z.string().min(1),
        message: z.string().min(1),
        type: z.enum([
          'CLASS',
          'GRADE',
          'RISK',
          'ATTENDANCE',
          'ACTIVITY',
          'EXAM',
          'DEADLINE',
          'EVENT',
          'REMINDER',
          'SCHEDULE',
        ]),
        priority: z.enum(['URGENT', 'IMPORTANT', 'INFO', 'SYSTEM']).default('INFO'),
        link: z.string().max(300).default(''),
        dedupeKey: z.string().max(200).optional(),
        metadata: z.record(z.any()).optional(),
      })
      .parse(req.body);

    if (req.user?.role === 'PROFESSOR' && body.userId !== req.user.id) {
      return res.status(403).json({ ok: false, message: 'Forbidden' });
    }

    const resultado = await crearNotificacion(body);
    if (!resultado.id) {
      return res.status(202).json({ ok: true, omitida: resultado.omitida });
    }
    res.status(resultado.creada ? 201 : 200).json({ ok: true, id: resultado.id, creada: resultado.creada });
  } catch (err) {
    next(err);
  }
});

// ── Lectura y limpieza ───────────────────────────────────────────────────────

/** Ámbito de escritura sobre la bandeja: los propios, salvo ADMIN/COORDINATOR. */
function ambitoPropio(req: { user?: { id: string; role: string } }): Record<string, unknown> {
  if (req.user?.role === 'PROFESSOR' || req.user?.role === 'STUDENT') return { userId: req.user.id };
  return {};
}

notificationRouter.patch('/read-all', requireRole(...TODOS), async (req, res, next) => {
  try {
    const resultado = await NotificationModel.updateMany(
      { ...ambitoPropio(req), deletedAt: null, readAt: null },
      { $set: { readAt: new Date() } },
    );
    emitToUser(req.user!.id, 'sync:update', { entity: 'notification', action: 'read-all', id: req.user!.id });
    res.json({ ok: true, count: resultado.modifiedCount ?? 0 });
  } catch (err) {
    next(err);
  }
});

notificationRouter.patch('/:id/read', requireRole(...TODOS), async (req, res, next) => {
  try {
    const filter: Record<string, unknown> = { _id: req.params.id, deletedAt: null, ...ambitoPropio(req) };
    const item = await NotificationModel.findOneAndUpdate(filter, { $set: { readAt: new Date() } }, { new: true });
    if (!item) return res.status(404).json({ ok: false, message: 'Not found' });
    emitToUser(String(item.userId), 'sync:update', { entity: 'notification', action: 'read', id: String(item._id) });
    res.json({ ok: true, item });
  } catch (err) {
    next(err);
  }
});

notificationRouter.delete('/:id', requireRole(...TODOS), async (req, res, next) => {
  try {
    const filter: Record<string, unknown> = { _id: req.params.id, deletedAt: null, ...ambitoPropio(req) };
    // Baja lógica: la clave de dedupe sigue ocupada, así que el escáner no
    // vuelve a crear de inmediato lo que el docente acaba de descartar.
    const item = await NotificationModel.findOneAndUpdate(
      filter,
      { $set: { deletedAt: new Date(), readAt: new Date() } },
      { new: true },
    );
    if (!item) return res.status(404).json({ ok: false, message: 'Not found' });
    emitToUser(String(item.userId), 'sync:update', { entity: 'notification', action: 'delete', id: String(item._id) });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
