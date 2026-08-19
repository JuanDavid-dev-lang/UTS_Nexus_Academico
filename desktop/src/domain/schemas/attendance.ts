/**
 * Asistencia y escaneo de planillas.
 */
import { z } from 'zod';
import { mongoDoc, numberish, objectId } from './common';

// ── Attendance ──────────────────────────────────────────────────────────────
export const attendanceSchema = mongoDoc.extend({
  studentId: objectId,
  subjectId: objectId,
  groupId: objectId.optional().nullable(),
  teacherId: objectId.optional(),
  period: z.string().optional().default(''),
  date: z.string(),
  durationMinutes: numberish.optional().default(90),
  present: z.boolean(),
  notes: z.string().optional().default(''),
});
export type Attendance = z.infer<typeof attendanceSchema>;

export const attendanceSummarySchema = z.object({
  ok: z.literal(true),
  summary: z.object({
    totalClasses: numberish,
    misses: numberish,
    totalMinutes: numberish,
    presentMinutes: numberish,
    attendanceRate: numberish,
  }),
});

// ── Escaneo de planillas de asistencia ──────────────────────────────────────

/** Qué tan segura es la atribución de una fila leída a un estudiante. */
export const nivelCoincidencia = z.enum(['exacta', 'probable', 'dudosa', 'sin-coincidencia']);
export type NivelCoincidencia = z.infer<typeof nivelCoincidencia>;

export const celdaEscaneadaSchema = z.object({
  columna: z.number().int(),
  presente: z.boolean(),
  dudosa: z.boolean(),
});

export const filaEscaneadaSchema = z.object({
  indice: z.number().int(),
  cedulaLeida: z.string(),
  nombreLeido: z.string(),
  studentId: z.string().nullable(),
  code: z.string().nullable(),
  fullName: z.string().nullable(),
  nivel: nivelCoincidencia,
  avisos: z.array(z.string()),
  celdas: z.array(celdaEscaneadaSchema),
});
export type FilaEscaneada = z.infer<typeof filaEscaneadaSchema>;

export const matriculadoSchema = z.object({
  id: z.string(),
  code: z.string(),
  fullName: z.string(),
});
export type Matriculado = z.infer<typeof matriculadoSchema>;

/** Propuesta de lectura. Nada de esto está guardado todavía. */
export const escaneoPlanillaSchema = z.object({
  ok: z.literal(true),
  groupId: z.string(),
  subjectId: z.string(),
  period: z.string(),
  columnasFecha: z.number().int(),
  /** Una por columna, leida de la cabecera. `null` donde no se pudo. */
  fechasSugeridas: z.array(z.string().nullable()).default([]),
  avisos: z.array(z.string()),
  filas: z.array(filaEscaneadaSchema),
  ausentesDeLaFoto: z.array(matriculadoSchema),
  matriculados: z.array(matriculadoSchema),
});
export type EscaneoPlanilla = z.infer<typeof escaneoPlanillaSchema>;
