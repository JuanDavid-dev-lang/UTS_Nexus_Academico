/**
 * Matrículas: lo que vincula a un estudiante con un grupo.
 */
import { z } from 'zod';
import { mongoDoc, refId } from './common';

// ── Enrollments ─────────────────────────────────────────────────────────────

/**
 * Los ids van por `refId`: el backend histórico poblaba `studentId` y una
 * referencia colgante llega como null — cualquiera de las dos formas rechazada
 * aquí tumbaba el array entero y apagaba en silencio notas y asistencia. Una
 * fila sin estudiante resoluble queda con '' y el repositorio la descarta.
 */
export const enrollmentSchema = mongoDoc.extend({
  studentId: refId,
  subjectId: refId,
  groupId: refId.optional().nullable(),
  period: z.string().optional().default(''),
});
export type Enrollment = z.infer<typeof enrollmentSchema>;
