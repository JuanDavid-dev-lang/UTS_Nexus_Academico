/**
 * Riesgo académico e intervenciones.
 */
import { z } from 'zod';
import { numberish, objectId, riskLevel } from './common';

// ── Risk ────────────────────────────────────────────────────────────────────
/**
 * Estado del seguimiento de una alerta de riesgo.
 *
 * `PENDIENTE` es el estado por defecto y significa «nadie lo ha mirado aún»,
 * que es información distinta de «lo miré y no respondió».
 */
export const interventionStatusSchema = z.enum([
  'PENDIENTE',
  'CONTACTADO',
  'CITA_ACORDADA',
  'NO_RESPONDE',
  'RESUELTO',
]);
export type InterventionStatus = z.infer<typeof interventionStatusSchema>;

export const riskItemSchema = z.object({
  studentId: objectId,
  code: z.string(),
  fullName: z.string(),
  subjectId: objectId,
  notaFinal: numberish,
  attendanceRate: numberish,
  missed: numberish,
  riskScore: numberish,
  level: riskLevel,
  motivos: z.array(z.string()).optional().default([]),
  /*
   * Qué se hizo ya con este estudiante. Convierte el tablero en un seguimiento:
   * sin esto la lista repetía los mismos nombres cada semana sin distinguir el
   * caso nuevo del que llevas un mes atendiendo.
   */
  interventionStatus: interventionStatusSchema.optional().default('PENDIENTE'),
  interventionNote: z.string().optional().default(''),
  interventionAt: z.string().nullish(),
});
export type RiskItem = z.infer<typeof riskItemSchema>;

export const riskResponseSchema = z.object({
  ok: z.literal(true),
  items: z.array(riskItemSchema),
});
