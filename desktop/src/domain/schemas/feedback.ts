/**
 * Buzón de sugerencias y reportes de error.
 */
import { z } from 'zod';
import { mongoDoc } from './common';
import { autorAviso } from './announcements';

// ── Buzón de sugerencias ────────────────────────────────────────────────────

export const tipoFeedback = z.enum(['SUGERENCIA', 'ERROR']);
export type TipoFeedback = z.infer<typeof tipoFeedback>;

export const estadoFeedback = z.enum(['NUEVO', 'EN_REVISION', 'RESUELTO', 'DESCARTADO']);
export type EstadoFeedback = z.infer<typeof estadoFeedback>;

export const feedbackSchema = mongoDoc.extend({
  tipo: tipoFeedback.catch('SUGERENCIA'),
  mensaje: z.string(),
  estado: estadoFeedback.catch('NUEVO'),
  origen: z.string().optional().default('DESKTOP'),
  appVersion: z.string().nullable().optional(),
  // Mismo autor normalizado que los avisos: poblado u ObjectId a secas.
  autorId: autorAviso,
});
export type Feedback = z.infer<typeof feedbackSchema>;

export const feedbackInputSchema = z.object({
  tipo: tipoFeedback,
  mensaje: z
    .string()
    .trim()
    .min(10, 'Cuenta un poco más: con menos de 10 caracteres no hay qué revisar.')
    .max(2000),
});
export type FeedbackInput = z.infer<typeof feedbackInputSchema>;
