/**
 * Estudiantes: ficha, entrada del directorio global y alta.
 */
import { z } from 'zod';
import { mongoDoc } from './common';

// ── Students ────────────────────────────────────────────────────────────────
export const studentSchema = mongoDoc.extend({
  code: z.string(),
  fullName: z.string(),
  // Los documentos anteriores a la incorporación del correo pueden no tenerlo
  // o conservarlo como null. La UI usa una cadena vacía como representación
  // interna, sin confundirla con el correo de la cuenta de acceso.
  email: z.string().nullable().optional().transform((value) => value ?? ''),
  program: z.string().optional().default(''),
  photoUrl: z.string().nullable().optional(),
});
export type Student = z.infer<typeof studentSchema>;

/**
 * Resultado del directorio global (`GET /students/search`).
 *
 * Deliberadamente más pobre que `studentSchema`: para matricular basta la
 * identidad, y un buscador que además devolviera notas o riesgo expondría el
 * expediente de estudiantes que aún no son de quien busca.
 */
export const studentDirectoryEntrySchema = mongoDoc.extend({
  code: z.string(),
  fullName: z.string(),
  program: z.string().optional().default(''),
  photoUrl: z.string().nullable().optional(),
});
export type StudentDirectoryEntry = z.infer<typeof studentDirectoryEntrySchema>;

/** Fila de una lista importada: lo mínimo que el backend necesita para matricular. */
export const rosterRowSchema = z.object({
  code: z.string().min(3, 'Cédula demasiado corta'),
  fullName: z.string().min(3, 'Nombre demasiado corto'),
  email: z.string().trim().toLowerCase().email('Correo inválido').optional(),
  program: z.string().optional(),
});
export type RosterRow = z.infer<typeof rosterRowSchema>;

export const studentInputSchema = z.object({
  code: z.string().trim().min(3, 'Mínimo 3 caracteres'),
  fullName: z.string().trim().min(3, 'Nombre demasiado corto'),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .refine((value) => value === '' || z.string().email().safeParse(value).success, 'Correo inválido')
    .transform((value) => value || undefined)
    .optional(),
  program: z.string().trim().min(2, 'Indica el programa'),
});
export type StudentInput = z.infer<typeof studentInputSchema>;
