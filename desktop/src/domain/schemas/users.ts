/**
 * Personal: cuentas, roles y programas a cargo.
 *
 * Es la única pantalla donde se decide el alcance de una coordinación o de una
 * secretaría, así que el esquema conserva los programas en las dos formas: los
 * ids (que es lo que se escribe) y sus nombres (que es lo que se lee). Traducir
 * el id en el cliente obligaría a mantener aquí una copia del catálogo, y una
 * copia del catálogo es un programa que existe en el servidor y no en la app.
 */
import { z } from 'zod';
import { objectId, role } from './common';

export const rolCatalogoSchema = z.object({
  id: role,
  nombre: z.string(),
  descripcion: z.string(),
  /** `true` si su alcance se define asignándole programas. */
  porPrograma: z.boolean(),
});
export type RolCatalogo = z.infer<typeof rolCatalogoSchema>;

export const usuarioPersonalSchema = z.object({
  id: objectId,
  email: z.string(),
  fullName: z.string(),
  role,
  programas: z.array(z.string()),
  programasNombres: z.array(z.string()),
  photoUrl: z.string().nullable(),
  lastLoginAt: z.string().nullable(),
  profesor: z
    .object({
      id: objectId,
      cedula: z.string().nullable(),
      estado: z.string(),
      esDirectorTrabajoGrado: z.boolean(),
      programas: z.array(z.string()),
    })
    .nullable(),
});
export type UsuarioPersonal = z.infer<typeof usuarioPersonalSchema>;

/**
 * Alta de una cuenta desde Configuración.
 *
 * `programas` solo significa algo para coordinación y secretaría; el formulario
 * no lo ofrece para los demás y el servidor lo guarda vacío. `STUDENT` no entra
 * por aquí: su cuenta cuelga de una ficha de estudiante.
 */
export type NuevaCuenta = {
  email: string;
  password: string;
  fullName: string;
  role: z.infer<typeof role>;
  programas?: string[];
  employeeCode?: string;
};

export type CambioDeUsuario = {
  fullName?: string;
  role?: z.infer<typeof role>;
  programas?: string[];
};
