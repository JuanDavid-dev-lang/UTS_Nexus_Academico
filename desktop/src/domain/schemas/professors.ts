/**
 * Fichas de docentes (gestión administrativa).
 */
import { z } from 'zod';
import { mongoDoc } from './common';

// ── Docentes (gestión administrativa) ───────────────────────────────────────

/** Usuario poblado o id a secas, normalizado igual que el autor de un aviso. */
const usuarioPoblado = z
  .union([z.object({ fullName: z.string().optional(), email: z.string().optional() }).partial(), z.string(), z.null()])
  .optional()
  .transform(valor => (valor && typeof valor === 'object' ? valor : null));

export const profesorAdminSchema = mongoDoc.extend({
  userId: usuarioPoblado,
  cedula: z.string().nullish(),
  nombres: z.string().optional().default(''),
  apellidos: z.string().optional().default(''),
  sede: z.string().nullish(),
  facultad: z.string().nullish(),
  programas: z.array(z.string()).optional().default([]),
  estado: z.string().optional().default('APROBADO'),
  esDirectorTrabajoGrado: z.boolean().optional().default(false),
});
export type ProfesorAdmin = z.infer<typeof profesorAdminSchema>;
