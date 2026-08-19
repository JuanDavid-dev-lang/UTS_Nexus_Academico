/**
 * Actividades académicas y casos de patrón de inasistencia.
 *
 * `estado` es lo que se muestra y lo calcula el BACKEND: `LATE` no está
 * guardado, se deriva del reloj del servidor. El cliente no lo recalcula —si
 * lo hiciera, un equipo con la hora mal puesta mostraría vencida una entrega
 * que no lo está, y nadie sabría cuál de los dos miente.
 */
import { z } from 'zod';
import { mongoDoc, numberish } from './common';

export const estadoActividad = z.enum(['OPEN', 'CLOSED', 'LATE']);
export type EstadoActividad = z.infer<typeof estadoActividad>;

export const actividadSchema = mongoDoc.extend({
  title: z.string(),
  description: z.string().default(''),
  subjectId: z.string(),
  groupId: z.string().nullable().default(null),
  teacherId: z.string(),
  period: z.string().default(''),
  dueAt: z.string(),
  weight: numberish.default(0),
  attachmentUrl: z.string().nullable().default(null),
  /** Lo que decidió una persona: `OPEN` o `CLOSED`. */
  status: z.enum(['OPEN', 'CLOSED']).catch('OPEN'),
  /** Lo que se muestra: la decisión más el reloj del servidor. */
  estado: estadoActividad.catch('OPEN'),
  vencida: z.boolean().default(false),
  closedAt: z.string().nullable().optional(),
  reopenedAt: z.string().nullable().optional(),
});
export type Actividad = z.infer<typeof actividadSchema>;

export const actividadInputSchema = z.object({
  title: z.string().trim().min(1, 'Ponle un título.').max(200),
  description: z.string().trim().max(4000).default(''),
  subjectId: z.string().min(1, 'Elige la materia.'),
  groupId: z.string().optional(),
  period: z.string().optional(),
  dueAt: z.string().min(1, 'Indica la fecha límite.'),
  weight: z.number().min(0).max(1).default(0),
  attachmentUrl: z.string().url().max(500).optional().or(z.literal('')),
});
export type ActividadInput = z.infer<typeof actividadInputSchema>;

// ── Casos de patrón de inasistencia ─────────────────────────────────────────

export const patronAsistencia = z.enum([
  'AUSENCIAS_CONSECUTIVAS_2',
  'AUSENCIAS_CONSECUTIVAS_3',
  'TARDANZAS_REPETIDAS',
  'CAIDA_RECIENTE',
  'ASISTENCIA_PARCIAL_REPETIDA',
]);
export type PatronAsistencia = z.infer<typeof patronAsistencia>;

export const casoAsistenciaSchema = mongoDoc.extend({
  studentId: z.string(),
  subjectId: z.string(),
  teacherId: z.string().nullable().default(null),
  period: z.string().default(''),
  pattern: patronAsistencia,
  severity: z.enum(['BAJA', 'MEDIA', 'ALTA']).catch('MEDIA'),
  evidence: z.string().default(''),
  evidenceData: z.record(z.union([z.number(), z.string()])).default({}),
  detectedAt: z.string().optional(),
  lastSeenAt: z.string().optional(),
  occurrences: numberish.default(1),
  status: z.enum(['ABIERTO', 'EN_SEGUIMIENTO', 'RESUELTO', 'DESCARTADO']).catch('ABIERTO'),
  interventionNote: z.string().default(''),
  interventionAt: z.string().nullable().default(null),
});
export type CasoAsistencia = z.infer<typeof casoAsistenciaSchema>;

/**
 * Título legible de cada patrón.
 *
 * Es la única copia en el cliente, y es solo texto: los UMBRALES que definen
 * cuándo se dispara cada patrón viven en el backend
 * (`domains/attendance/patterns.ts`) y no se replican aquí. Duplicar el umbral
 * significaría que un cambio de política deja al escritorio contando distinto
 * que el servidor.
 */
export const TITULO_PATRON: Record<PatronAsistencia, string> = {
  AUSENCIAS_CONSECUTIVAS_2: 'Dos ausencias seguidas',
  AUSENCIAS_CONSECUTIVAS_3: 'Tres o más ausencias seguidas',
  TARDANZAS_REPETIDAS: 'Llegadas tarde repetidas',
  CAIDA_RECIENTE: 'Caída reciente de asistencia',
  ASISTENCIA_PARCIAL_REPETIDA: 'Asistencia parcial repetida',
};
