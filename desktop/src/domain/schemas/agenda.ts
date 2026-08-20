/**
 * Contratos de la agenda académica.
 *
 * El backend entrega las clases YA expandidas a ocurrencias con fecha y hora
 * absolutas. El cliente no vuelve a calcular a qué hora es una clase: si lo
 * hiciera, PC y Android podrían discrepar en cuanto uno tuviera mal la zona
 * horaria, y el docente no tendría forma de saber cuál de los dos miente.
 */
import { z } from 'zod';
import { numberish, objectId } from './common';

export const agendaTipo = z.enum([
  'CLASS',
  'EVALUATION',
  'EXAM',
  'DELIVERY',
  'ACTIVITY',
  'MEETING',
  'TUTORING',
  'ACADEMIC',
  'REMINDER',
]);
export type AgendaTipo = z.infer<typeof agendaTipo>;

export const agendaPrioridad = z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']);
export type AgendaPrioridad = z.infer<typeof agendaPrioridad>;

export const agendaItemSchema = z.object({
  id: z.string(),
  origen: z.enum(['schedule', 'event', 'activity']),
  sourceId: z.string(),
  kind: z.enum(['CLASS', 'EVENT', 'ACTIVITY']),
  type: agendaTipo.catch('ACTIVITY'),
  title: z.string(),
  description: z.string().optional().default(''),
  startAt: z.string(),
  endAt: z.string(),
  durationMinutes: z.number(),
  allDay: z.boolean().optional().default(false),
  date: z.string(),
  subjectId: z.string().nullable().optional().default(null),
  subjectName: z.string().optional().default(''),
  subjectCode: z.string().optional().default(''),
  groupId: z.string().nullable().optional().default(null),
  groupName: z.string().optional().default(''),
  teacherId: z.string().nullable().optional().default(null),
  teacherName: z.string().optional().default(''),
  classroom: z.string().optional().default(''),
  modality: z.string().optional().default(''),
  period: z.string().optional().default(''),
  priority: agendaPrioridad.catch('MEDIUM'),
  reminderMinutes: z.array(z.number()).optional().default([]),
  status: z.enum(['PROXIMA', 'EN_CURSO', 'TERMINADA']).catch('PROXIMA'),
  editable: z.boolean().optional().default(false),
});
export type AgendaItem = z.infer<typeof agendaItemSchema>;

export const agendaResponseSchema = z.object({
  ok: z.literal(true),
  from: z.string(),
  to: z.string(),
  /** Desfase del campus respecto a UTC. Con él se pinta la hora de pared. */
  campusOffsetMinutes: z.number().optional().default(-300),
  items: z.array(agendaItemSchema),
});

export const agendaResumenSchema = z.object({
  ok: z.literal(true),
  ahora: z.string(),
  campusOffsetMinutes: z.number().optional().default(-300),
  enCurso: agendaItemSchema.extend({ minutosRestantes: z.number() }).nullable(),
  proxima: agendaItemSchema.extend({ minutosPara: z.number() }).nullable(),
  hoy: z.array(agendaItemSchema),
  proximosEventos: z.array(agendaItemSchema),
  totalHoy: z.number(),
  totalSemana: z.number(),
});
export type AgendaResumen = z.infer<typeof agendaResumenSchema>;

// ── Eventos (lo que sí se crea y edita desde el calendario) ──────────────────

export const eventoTipo = z.enum([
  'EVALUATION',
  'EXAM',
  'DELIVERY',
  'ACTIVITY',
  'MEETING',
  'TUTORING',
  'ACADEMIC',
  'REMINDER',
]);
export type EventoTipo = z.infer<typeof eventoTipo>;

export const calendarEventSchema = z.object({
  _id: objectId,
  title: z.string(),
  description: z.string().optional().default(''),
  type: eventoTipo.catch('ACTIVITY'),
  startAt: z.string(),
  endAt: z.string().nullable().optional().default(null),
  allDay: z.boolean().optional().default(false),
  subjectId: z.string().nullable().optional().default(null),
  groupId: z.string().nullable().optional().default(null),
  location: z.string().optional().default(''),
  priority: agendaPrioridad.catch('MEDIUM'),
  reminderMinutes: z.array(z.number()).optional().default([]),
  period: z.string().optional().default(''),
});
export type CalendarEvent = z.infer<typeof calendarEventSchema>;

export type CalendarEventInput = {
  title: string;
  description?: string;
  type: EventoTipo;
  startAt: string;
  endAt?: string;
  allDay?: boolean;
  subjectId?: string;
  groupId?: string;
  location?: string;
  priority?: AgendaPrioridad;
  reminderMinutes?: number[];
  period?: string;
};

// ── Preferencias de notificación ─────────────────────────────────────────────

export const notificationPreferencesSchema = z.object({
  clases: z.boolean(),
  evaluaciones: z.boolean(),
  asistencia: z.boolean(),
  riesgo: z.boolean(),
  intervenciones: z.boolean(),
  eventos: z.boolean(),
  recordatorios: z.boolean(),
  sincronizacion: z.boolean(),
  sistema: z.boolean(),
  inApp: z.boolean(),
  push: z.boolean(),
  email: z.boolean(),
  classLeadMinutes: z.array(z.number()),
  quietHours: z.object({
    enabled: z.boolean(),
    start: z.string(),
    end: z.string(),
  }),
  urgentBypassesQuietHours: z.boolean(),
});
export type NotificationPreferences = z.infer<typeof notificationPreferencesSchema>;

export const notificationPreferencesResponse = z.object({
  ok: z.literal(true),
  preferences: notificationPreferencesSchema,
  /** `false` = este servidor no tiene FCM configurado. La UI debe decirlo. */
  pushConfigurado: z.boolean().optional().default(false),
});

// ── Importación del horario (reporte PDF de Academusoft) ────────────────────

export const sesionHorarioSchema = z.object({
  codigo: z.string(),
  nombre: z.string(),
  grupo: z.string().optional().default(''),
  /** 1=Lunes … 7=Domingo. */
  dia: numberish,
  horaInicio: z.string(),
  horaFin: z.string(),
  aula: z.string().optional().default(''),
  confianza: numberish.optional().default(1),
  avisos: z.array(z.string()).optional().default([]),
  /** La materia ya existe en el periodo del docente (si no, se creará). */
  materiaExiste: z.boolean(),
  /** Ya hay una franja a esa hora ese día: confirmar la actualiza, no duplica. */
  franjaExiste: z.boolean(),
});
export type SesionHorario = z.infer<typeof sesionHorarioSchema>;

export const horarioScanResponseSchema = z.object({
  ok: z.literal(true),
  origen: z.string(),
  avisos: z.array(z.string()).optional().default([]),
  sesiones: z.array(sesionHorarioSchema),
});
export type HorarioScan = z.infer<typeof horarioScanResponseSchema>;

export const horarioConfirmResponseSchema = z.object({
  ok: z.literal(true),
  materiasCreadas: numberish,
  franjasCreadas: numberish,
  franjasActualizadas: numberish,
});
export type HorarioConfirmado = z.infer<typeof horarioConfirmResponseSchema>;
