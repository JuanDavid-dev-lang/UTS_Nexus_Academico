/**
 * Historial cronológico del estudiante.
 *
 * La unión y el orden los hace el backend. El cliente no cruza colecciones:
 * si lo hiciera, el escritorio y el móvil ordenarían con criterios distintos y
 * mostrarían dos historias del mismo estudiante.
 */
import { z } from 'zod';

export const tipoEventoHistorial = z.enum([
  'MATRICULA',
  'NOTA',
  'ASISTENCIA',
  'ALERTA_RIESGO',
  'INTERVENCION',
  'PATRON_ASISTENCIA',
  'ACTIVIDAD',
  'CIERRE_PERIODO',
]);
export type TipoEventoHistorial = z.infer<typeof tipoEventoHistorial>;

export const eventoHistorialSchema = z.object({
  id: z.string(),
  type: tipoEventoHistorial,
  occurredAt: z.string(),
  title: z.string(),
  summary: z.string().default(''),
  period: z.string().default(''),
  subjectId: z.string().nullable().default(null),
  subjectName: z.string().nullable().default(null),
  metadata: z.record(z.unknown()).default({}),
  sourceId: z.string(),
  link: z.string().nullable().default(null),
});
export type EventoHistorial = z.infer<typeof eventoHistorialSchema>;

const episodioSeguimientoSchema = z.object({
  id: z.string(), action: z.string(), status: z.string(), createdAt: z.string(),
  closedAt: z.string().nullable(), initialRisk: z.string(), closingRisk: z.string().nullable(),
  note: z.string().optional(), closingNote: z.string().optional(),
});

export const expedienteSeguimientoSchema = z.object({
  student: z.object({ id: z.string(), code: z.string(), fullName: z.string(), email: z.string().nullable(), program: z.string() }),
  context: z.object({ subjectId: z.string().nullable(), subjectName: z.string().nullable(), period: z.string().nullable() }),
  academic: z.array(z.object({
    subjectId: z.string(), subjectName: z.string().nullable(), period: z.string(),
    finalGrade: z.number(), currentGrade: z.number(), cuts: z.array(z.number()), complete: z.boolean(),
    attendancePercentage: z.number(), absences: z.number(),
    risk: z.object({ level: z.string(), score: z.number(), reasons: z.array(z.string()) }),
  })),
  followUp: z.object({ open: episodioSeguimientoSchema.nullable(), episodes: z.array(episodioSeguimientoSchema), progress: z.string().nullable() }),
  timeline: z.object({ items: z.array(eventoHistorialSchema), total: z.number(), page: z.number(), limit: z.number(), hasMore: z.boolean() }),
  allowedActions: z.array(z.string()),
});
export type ExpedienteSeguimiento = z.infer<typeof expedienteSeguimientoSchema>;

/** Etiqueta legible de cada tipo. Solo presentación. */
export const ETIQUETA_EVENTO: Record<TipoEventoHistorial, string> = {
  MATRICULA: 'Matrícula',
  NOTA: 'Nota',
  ASISTENCIA: 'Asistencia',
  ALERTA_RIESGO: 'Riesgo',
  INTERVENCION: 'Intervención',
  PATRON_ASISTENCIA: 'Patrón',
  ACTIVIDAD: 'Actividad',
  CIERRE_PERIODO: 'Cierre',
};
