/**
 * Agenda académica: consulta unificada y CRUD de eventos.
 *
 * `GET /agenda` es de solo lectura y junta horario + eventos + entregas; la
 * escritura vive en `/agenda/events`, que toca únicamente `EventoCalendario`.
 * Las clases se siguen editando en `/schedules` y las entregas en `/activities`:
 * un mismo dato con dos endpoints de escritura es un desfase esperando fecha.
 */
import { Router } from 'express';
import { z } from 'zod';
import { identificar, requireRole } from '../../middlewares/auth.js';
import { CalendarEventModel } from '../../models/calendar-event.model.js';
import { getProfessorScope } from '../../shared/professor-scope.js';
import { emitToUser } from '../../shared/socket.js';
import { env } from '../../shared/env.js';
import { normalizarAntelaciones } from '../../domains/agenda/agenda.service.js';
import {
  construirAgenda,
  resumenAgenda,
  MAX_DIAS_RANGO,
  type TipoAgenda,
} from './agenda.service.js';

export const agendaRouter = Router();
agendaRouter.use(identificar);

const MS_DIA = 86_400_000;

const TIPOS: TipoAgenda[] = [
  'CLASS',
  'EVALUATION',
  'EXAM',
  'DELIVERY',
  'ACTIVITY',
  'MEETING',
  'TUTORING',
  'ACADEMIC',
  'REMINDER',
];

const tipoEvento = z.enum([
  'EVALUATION',
  'EXAM',
  'DELIVERY',
  'ACTIVITY',
  'MEETING',
  'TUTORING',
  'ACADEMIC',
  'REMINDER',
]);

const rangoSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  subjectId: z.string().optional(),
  groupId: z.string().optional(),
  /** CSV: `tipos=CLASS,EXAM`. Vacío = todos. */
  tipos: z.string().optional(),
  soloClases: z.enum(['0', '1', 'true', 'false']).optional(),
});

/**
 * Rango efectivo. Sin parámetros devuelve la semana en curso, que es la vista
 * principal; con un rango absurdo (dos años) se recorta en vez de fallar,
 * porque el cliente puede pedirlo por un error de fecha y una pantalla vacía
 * con un 400 no ayuda a nadie.
 */
function resolverRango(from?: Date, to?: Date): { desde: Date; hasta: Date } {
  const ahora = new Date();
  const desde = from && Number.isFinite(from.getTime()) ? from : new Date(ahora.getTime() - 2 * MS_DIA);
  let hasta = to && Number.isFinite(to.getTime()) ? to : new Date(desde.getTime() + 9 * MS_DIA);
  if (hasta.getTime() <= desde.getTime()) hasta = new Date(desde.getTime() + MS_DIA);
  const tope = new Date(desde.getTime() + MAX_DIAS_RANGO * MS_DIA);
  if (hasta.getTime() > tope.getTime()) hasta = tope;
  return { desde, hasta };
}

agendaRouter.get('/', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR', 'STUDENT'), async (req, res, next) => {
  try {
    const query = rangoSchema.parse(req.query);
    const { desde, hasta } = resolverRango(query.from, query.to);

    const tipos = query.tipos
      ?.split(',')
      .map(valor => valor.trim().toUpperCase())
      .filter((valor): valor is TipoAgenda => (TIPOS as string[]).includes(valor));

    const items = await construirAgenda(
      { userId: req.user!.id, role: req.user!.role },
      {
        desde,
        hasta,
        subjectId: query.subjectId,
        groupId: query.groupId,
        tipos: tipos?.length ? tipos : undefined,
        soloClases: query.soloClases === '1' || query.soloClases === 'true',
      },
    );

    res.json({
      ok: true,
      from: desde.toISOString(),
      to: hasta.toISOString(),
      // El cliente formatea con este desfase: así el teléfono con la zona
      // horaria mal puesta sigue mostrando la hora del campus.
      campusOffsetMinutes: env.CAMPUS_UTC_OFFSET_MIN,
      items,
    });
  } catch (err) {
    next(err);
  }
});

agendaRouter.get('/resumen', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR', 'STUDENT'), async (req, res, next) => {
  try {
    const resumen = await resumenAgenda({ userId: req.user!.id, role: req.user!.role });
    res.json({ ok: true, campusOffsetMinutes: env.CAMPUS_UTC_OFFSET_MIN, ...resumen });
  } catch (err) {
    next(err);
  }
});

// ── Eventos ──────────────────────────────────────────────────────────────────

const cuerpoEvento = z.object({
  title: z.string().min(1).max(160),
  description: z.string().max(2000).default(''),
  type: tipoEvento,
  startAt: z.coerce.date(),
  endAt: z.coerce.date().optional(),
  allDay: z.boolean().default(false),
  subjectId: z.string().optional(),
  groupId: z.string().optional(),
  location: z.string().max(120).default(''),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
  reminderMinutes: z.array(z.number().int()).default([]),
  period: z.string().max(16).default(''),
});

/** Un docente solo cuelga eventos de sus materias y sus grupos. */
async function validarAlcance(
  usuario: { id: string; role: string } | undefined,
  subjectId?: string,
  groupId?: string,
): Promise<string | null> {
  if (usuario?.role !== 'PROFESSOR') return null;
  if (!subjectId && !groupId) return null;
  const scope = await getProfessorScope(usuario.id);
  if (subjectId && !scope.subjectIds.includes(subjectId)) return 'Subject not assigned';
  if (groupId && !scope.groupIds.includes(groupId)) return 'Group not assigned';
  return null;
}

agendaRouter.get('/events', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'), async (req, res, next) => {
  try {
    const query = rangoSchema.parse(req.query);
    const { desde, hasta } = resolverRango(query.from, query.to);

    const filtro: Record<string, unknown> = {
      deletedAt: null,
      startAt: { $gte: desde, $lt: hasta },
    };
    if (req.user?.role === 'PROFESSOR') filtro.teacherId = req.user.id;
    if (query.subjectId) filtro.subjectId = query.subjectId;
    if (query.groupId) filtro.groupId = query.groupId;

    const items = await CalendarEventModel.find(filtro).sort({ startAt: 1 }).limit(500).lean();
    res.json({ ok: true, items });
  } catch (err) {
    next(err);
  }
});

agendaRouter.post('/events', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'), async (req, res, next) => {
  try {
    const body = cuerpoEvento.parse(req.body);
    const problema = await validarAlcance(req.user, body.subjectId, body.groupId);
    if (problema) return res.status(403).json({ ok: false, message: problema });

    if (body.endAt && body.endAt.getTime() <= body.startAt.getTime()) {
      return res.status(400).json({ ok: false, message: 'La hora de fin debe ser posterior a la de inicio.' });
    }

    const item = await CalendarEventModel.create({
      ...body,
      subjectId: body.subjectId ?? null,
      groupId: body.groupId ?? null,
      endAt: body.endAt ?? null,
      reminderMinutes: normalizarAntelaciones(body.reminderMinutes),
      teacherId: req.user!.id,
      createdBy: req.user!.id,
    });

    emitToUser(req.user!.id, 'sync:update', { entity: 'calendar', action: 'create', id: String(item._id) });
    res.status(201).json({ ok: true, item });
  } catch (err) {
    next(err);
  }
});

agendaRouter.patch('/events/:id', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'), async (req, res, next) => {
  try {
    const body = cuerpoEvento.partial().parse(req.body);
    const problema = await validarAlcance(req.user, body.subjectId, body.groupId);
    if (problema) return res.status(403).json({ ok: false, message: problema });

    const filtro: Record<string, unknown> = { _id: req.params.id, deletedAt: null };
    // Un docente solo edita los suyos. Filtrar solo el listado dejaría el
    // evento ajeno editable a quien copie un id.
    if (req.user?.role === 'PROFESSOR') filtro.teacherId = req.user.id;

    const cambios: Record<string, unknown> = { ...body, updatedBy: req.user!.id };
    if (body.reminderMinutes) cambios.reminderMinutes = normalizarAntelaciones(body.reminderMinutes);

    const item = await CalendarEventModel.findOneAndUpdate(filtro, { $set: cambios }, { new: true });
    if (!item) return res.status(404).json({ ok: false, message: 'Not found' });

    emitToUser(String(item.teacherId), 'sync:update', {
      entity: 'calendar',
      action: 'update',
      id: String(item._id),
    });
    res.json({ ok: true, item });
  } catch (err) {
    next(err);
  }
});

agendaRouter.delete('/events/:id', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'), async (req, res, next) => {
  try {
    const filtro: Record<string, unknown> = { _id: req.params.id, deletedAt: null };
    if (req.user?.role === 'PROFESSOR') filtro.teacherId = req.user.id;

    // Baja lógica, como el resto del sistema: un parcial borrado por error se
    // recupera, y las notificaciones ya enviadas siguen apuntando a algo.
    const item = await CalendarEventModel.findOneAndUpdate(
      filtro,
      { $set: { deletedAt: new Date(), updatedBy: req.user!.id } },
      { new: true },
    );
    if (!item) return res.status(404).json({ ok: false, message: 'Not found' });

    emitToUser(String(item.teacherId), 'sync:update', {
      entity: 'calendar',
      action: 'delete',
      id: String(item._id),
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
