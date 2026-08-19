/**
 * Materias y grupos. Un grupo es la unidad dentro de una materia.
 */
import { z } from 'zod';
import { mongoDoc, numberish, objectId } from './common';

// ── Subjects ────────────────────────────────────────────────────────────────
export const subjectSchema = mongoDoc.extend({
  name: z.string(),
  code: z.string(),
  period: z.string(),
  credits: numberish.optional().default(0),
  professorId: objectId.optional(),
});
export type Subject = z.infer<typeof subjectSchema>;

export const subjectInputSchema = z.object({
  name: z.string().min(3, 'Nombre demasiado corto'),
  code: z.string().min(2, 'Código demasiado corto'),
  period: z.string().min(4, 'Formato: 2026-1'),
  credits: z.number().int().min(0).max(20),
});
export type SubjectInput = z.infer<typeof subjectInputSchema>;

// ── Groups ──────────────────────────────────────────────────────────────────
export const groupSchema = mongoDoc.extend({
  name: z.string(),
  subjectId: objectId.optional(),
  period: z.string().optional(),
});
export type Group = z.infer<typeof groupSchema>;
