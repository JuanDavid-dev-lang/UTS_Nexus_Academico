import { describe, expect, it } from 'vitest';
import { usuarioPersonalSchema } from '@/domain/schemas/users';

/**
 * `institucion` es nueva y el backend ya la manda en cada item de `GET
 * /usuarios`, pero un servidor viejo (o un test que no la simula) no la
 * manda: `.default(null)` evita que ese campo ausente tumbe el parseo de la
 * lista entera, igual que pasa con `areas` o `profesor.institucion`.
 */
const BASE = {
  id: '65f0000000000000000000aa',
  email: 'ana.rios@uts.edu.co',
  fullName: 'Ana Ríos',
  role: 'COORDINATOR' as const,
  programas: [],
  programasNombres: [],
  photoUrl: null,
  lastLoginAt: null,
  profesor: null,
};

describe('usuarioPersonalSchema', () => {
  it('acepta un item con institución poblada', () => {
    const parsed = usuarioPersonalSchema.parse({
      ...BASE,
      institucion: {
        id: '65f0000000000000000000bb',
        institutionId: 'uts',
        nombre: 'Unidades Tecnológicas de Santander',
        sigla: 'UTS',
      },
    });

    expect(parsed.institucion).toEqual({
      id: '65f0000000000000000000bb',
      institutionId: 'uts',
      nombre: 'Unidades Tecnológicas de Santander',
      sigla: 'UTS',
    });
  });

  it('acepta un item sin institución, como ADMIN o un backend viejo', () => {
    expect(usuarioPersonalSchema.parse(BASE).institucion).toBeNull();
    expect(usuarioPersonalSchema.parse({ ...BASE, institucion: null }).institucion).toBeNull();
  });

  it('acepta la institución y la institución solicitada dentro de profesor', () => {
    const parsed = usuarioPersonalSchema.parse({
      ...BASE,
      role: 'PROFESSOR',
      profesor: {
        id: '65f0000000000000000000cc',
        cedula: '1098765432',
        estado: 'APROBADO',
        esDirectorTrabajoGrado: false,
        programas: [],
      },
    });

    // Un docente sin institución todavía puede tener una solicitud pendiente
    // de asociarse a un perfil: los dos campos son independientes.
    expect(parsed.profesor?.institucion).toBeNull();
    expect(parsed.profesor?.institucionSolicitada).toBeNull();
  });
});
