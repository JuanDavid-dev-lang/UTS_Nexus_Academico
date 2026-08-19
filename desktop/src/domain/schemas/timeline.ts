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
