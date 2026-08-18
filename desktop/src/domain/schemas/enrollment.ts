/**
 * Matrículas: lo que vincula a un estudiante con un grupo.
 */
import { z } from 'zod';
import { mongoDoc, objectId } from './common';

// ── Enrollments ─────────────────────────────────────────────────────────────
export const enrollmentSchema = mongoDoc.extend({
  studentId: objectId,
  subjectId: objectId,
  groupId: objectId.optional().nullable(),
  period: z.string().optional().default(''),
});
export type Enrollment = z.infer<typeof enrollmentSchema>;
