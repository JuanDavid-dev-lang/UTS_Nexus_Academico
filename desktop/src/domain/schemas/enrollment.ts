/**
 * Matrículas: lo que vincula a un estudiante con un grupo.
 */
import { z } from 'zod';
import { mongoDoc, objectId } from './common';

// ── Enrollments ─────────────────────────────────────────────────────────────

/**
 * `GET /enrollments` puebla `studentId` con la identidad del estudiante
 * (populate de Mongoose): llega un objeto, no un id. Exigir aquí un string
 * hacía fallar el esquema entero, y ese fallo apagaba en silencio todo lo que
 * cuelga de la matrícula — el botón de registrar notas y la pantalla de
 * asistencia. Se acepta cualquiera de las dos formas y se normaliza al id.
 */
const idPoblado = z.union([
  objectId,
  z.object({ _id: objectId }).passthrough().transform((doc) => doc._id),
]);

export const enrollmentSchema = mongoDoc.extend({
  studentId: idPoblado,
  subjectId: idPoblado,
  groupId: idPoblado.optional().nullable(),
  period: z.string().optional().default(''),
});
export type Enrollment = z.infer<typeof enrollmentSchema>;
