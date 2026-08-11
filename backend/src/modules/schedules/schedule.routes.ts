import { Router } from 'express';
import { z } from 'zod';
import { ScheduleModel } from '../../models/schedule.model.js';
import { SubjectModel } from '../../models/subject.model.js';
import { identificar, requireRole } from '../../middlewares/auth.js';
import { emitToUser } from '../../shared/socket.js';
import { crearNotificacion, fechaCampus } from '../../shared/notify.js';
import { getProfessorScope } from '../../shared/professor-scope.js';

export const scheduleRouter = Router();
scheduleRouter.use(identificar);

/**
 * Avisa al docente de que su horario cambió.
 *
 * Con clave por día: mover cuatro franjas seguidas es UN cambio de horario para
 * quien lo recibe, no cuatro avisos. Y el evento de sincronización viaja
 * siempre, aunque el aviso se haya deduplicado: la pantalla abierta tiene que
 * repintarse en los cuatro casos.
 */
async function avisarCambioDeHorario(teacherId: string, actorId: string | undefined, detalle: string) {
  emitToUser(teacherId, 'sync:update', { entity: 'schedule', action: 'change', id: teacherId });
  // Si el propio docente acaba de moverlo, ya lo sabe: notificárselo sería
  // contarle lo que acaba de hacer.
  if (actorId === teacherId) return;

  await crearNotificacion({
    userId: teacherId,
    type: 'SCHEDULE',
    priority: 'IMPORTANT',
    title: 'Tu horario fue actualizado',
    message: detalle,
    dedupeKey: `schedule-changed:${teacherId}:${fechaCampus(new Date())}`,
    link: '/agenda',
    metadata: { teacherId },
  });
}

/** Un docente solo toca franjas de sus materias. */
async function puedeTocarMateria(
  usuario: { id: string; role: string } | undefined,
  subjectId: string,
): Promise<boolean> {
  if (usuario?.role !== 'PROFESSOR') return true;
  const scope = await getProfessorScope(usuario.id);
  return scope.subjectIds.includes(subjectId);
}

scheduleRouter.get('/', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'), async (_req, res, next) => {
  try {
    const filter: Record<string, unknown> = { deletedAt: null };
    if (_req.user?.role === 'PROFESSOR') filter.teacherId = _req.user.id;
    const items = await ScheduleModel.find(filter).sort({ order: 1, dayOfWeek: 1, startTime: 1 }).limit(200).lean();

    // El nombre de la materia viaja con la franja: la pantalla de horario
    // mostraba el ObjectId recortado porque no tenía con qué resolverlo.
    const subjectIds = [...new Set(items.map(item => String(item.subjectId)).filter(Boolean))];
    const materias = subjectIds.length
      ? await SubjectModel.find({ _id: { $in: subjectIds } }).select('name code period').lean()
      : [];
    const porId = new Map(materias.map(materia => [String(materia._id), materia]));

    res.json({
      ok: true,
      items: items.map(item => {
        const materia = porId.get(String(item.subjectId));
        return {
          ...item,
          subjectName: String(materia?.name ?? ''),
          subjectCode: String(materia?.code ?? ''),
          period: String(materia?.period ?? ''),
        };
      }),
    });
  } catch (err) {
    next(err);
  }
});

scheduleRouter.post('/', requireRole('ADMIN', 'PROFESSOR'), async (req, res, next) => {
  try {
    const body = z.object({
      subjectId: z.string(),
      groupId: z.string().optional(),
      teacherId: z.string(),
      dayOfWeek: z.number().int().min(1).max(7),
      startTime: z.string().regex(/^\d{2}:\d{2}$/),
      endTime: z.string().regex(/^\d{2}:\d{2}$/),
      order: z.number().int().min(0).default(0),
      durationMinutes: z.number().int().min(30).max(300).default(90),
      classroom: z.string().default(''),
      modality: z.enum(['PRESENTIAL', 'VIRTUAL', 'HYBRID']).default('PRESENTIAL'),
    }).parse(req.body);

    if (!(await puedeTocarMateria(req.user, body.subjectId))) {
      return res.status(403).json({ ok: false, message: 'Subject not assigned' });
    }
    if (req.user?.role === 'PROFESSOR' && body.teacherId !== req.user.id) {
      return res.status(403).json({ ok: false, message: 'Forbidden' });
    }

    const item = await ScheduleModel.create(body);
    await avisarCambioDeHorario(String(item.teacherId), req.user?.id, 'Se agregó una clase a tu horario.');
    res.status(201).json({ ok: true, item });
  } catch (err) {
    next(err);
  }
});

scheduleRouter.patch('/:id', requireRole('ADMIN', 'PROFESSOR'), async (req, res, next) => {
  try {
    const body = z.object({
      order: z.number().int().min(0).optional(),
      dayOfWeek: z.number().int().min(1).max(7).optional(),
      startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
      endTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
      durationMinutes: z.number().int().min(30).max(300).optional(),
      classroom: z.string().optional(),
      modality: z.enum(['PRESENTIAL', 'VIRTUAL', 'HYBRID']).optional(),
    }).parse(req.body);

    const filtro: Record<string, unknown> = { _id: req.params.id, deletedAt: null };
    // Sin esto, un docente podía mover la franja de otro conociendo su id.
    if (req.user?.role === 'PROFESSOR') filtro.teacherId = req.user.id;

    const item = await ScheduleModel.findOneAndUpdate(filtro, { $set: body }, { new: true });
    if (!item) return res.status(404).json({ ok: false, message: 'Not found' });

    await avisarCambioDeHorario(String(item.teacherId), req.user?.id, 'Una de tus clases cambió de horario o de aula.');
    res.json({ ok: true, item });
  } catch (err) {
    next(err);
  }
});

scheduleRouter.delete('/:id', requireRole('ADMIN', 'PROFESSOR'), async (req, res, next) => {
  try {
    const filtro: Record<string, unknown> = { _id: req.params.id, deletedAt: null };
    if (req.user?.role === 'PROFESSOR') filtro.teacherId = req.user.id;

    // Baja lógica: el índice único es sobre (materia, día, hora, docente), y
    // borrar de verdad impediría distinguir "nunca existió" de "se canceló".
    const item = await ScheduleModel.findOneAndUpdate(
      filtro,
      { $set: { deletedAt: new Date(), status: 'CANCELLED' } },
      { new: true },
    );
    if (!item) return res.status(404).json({ ok: false, message: 'Not found' });

    await avisarCambioDeHorario(String(item.teacherId), req.user?.id, 'Se retiró una clase de tu horario.');
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

scheduleRouter.post('/reorder', requireRole('ADMIN', 'PROFESSOR'), async (req, res, next) => {
  try {
    const body = z.object({
      items: z.array(z.object({ id: z.string(), order: z.number().int().min(0) })).min(1),
    }).parse(req.body);

    const filtroBase: Record<string, unknown> = { deletedAt: null };
    if (req.user?.role === 'PROFESSOR') filtroBase.teacherId = req.user.id;

    await Promise.all(
      body.items.map(item =>
        ScheduleModel.findOneAndUpdate({ ...filtroBase, _id: item.id }, { $set: { order: item.order } }, { new: true })
      )
    );

    // Reordenar es cosmético: cambia cómo se lista, no cuándo es la clase. Se
    // sincroniza, pero no genera notificación.
    emitToUser(req.user!.id, 'sync:update', { entity: 'schedule', action: 'reorder', id: String(body.items.length) });
    res.json({ ok: true, count: body.items.length });
  } catch (err) {
    next(err);
  }
});
