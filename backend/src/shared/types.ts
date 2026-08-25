/**
 * Roles del sistema.
 *
 * El orden de la lista es el de autoridad decreciente y se usa tal cual en los
 * desplegables de los clientes: quien administra arriba, quien solo consulta
 * abajo.
 *
 * - `ADMIN`        — toda la institución, sin acotar. Incluye lo que nadie más
 *                    ve: auditoría, telemetría, reapertura de un periodo.
 * - `COORDINATOR`  — toda la institución **acotada a sus programas**. Ve y
 *                    cambia lo académico de las carreras que tiene asignadas.
 * - `SECRETARY`    — exactamente lo mismo que ve un coordinador de sus mismos
 *                    programas, pero **sin escribir nada**. Ni una nota, ni una
 *                    matrícula, ni un estado. Sí puede exportar.
 * - `PROFESSOR`    — solo sus materias, sus grupos y sus estudiantes.
 * - `STUDENT`      — solo su propio expediente.
 *
 * Que secretaría sea «coordinación sin escritura» no se implementa repitiendo
 * el rol en sesenta listas de `requireRole`: se implementa una vez en
 * `domains/scope/role-access.ts` y se aplica en `middlewares/auth.ts`. Copiarlo
 * ruta por ruta garantiza que alguna quede sin actualizar, y la que quede sin
 * actualizar no da error: da acceso.
 */
export type Role = 'ADMIN' | 'COORDINATOR' | 'SECRETARY' | 'PROFESSOR' | 'STUDENT';

export const ROLES: Role[] = ['ADMIN', 'COORDINATOR', 'SECRETARY', 'PROFESSOR', 'STUDENT'];

/** Nombre visible. Los clientes no vuelven a traducir el rol por su cuenta. */
export const NOMBRE_ROL: Record<Role, string> = {
  ADMIN: 'Administración',
  COORDINATOR: 'Coordinación',
  SECRETARY: 'Secretaría',
  PROFESSOR: 'Docente',
  STUDENT: 'Estudiante',
};

export const DESCRIPCION_ROL: Record<Role, string> = {
  ADMIN: 'Acceso completo a la institución, incluida la auditoría y el ciclo de vida de los periodos.',
  COORDINATOR: 'Ve y gestiona los programas que tenga asignados: materias, grupos, docentes y estudiantes.',
  SECRETARY: 'Ve y exporta lo mismo que coordinación en sus programas, pero no puede modificar nada.',
  PROFESSOR: 'Solo sus materias, sus grupos y sus estudiantes.',
  STUDENT: 'Solo su propio expediente académico.',
};

/**
 * Roles cuyo alcance se decide por **programa académico**, no por matrícula.
 *
 * `ADMIN` queda fuera a propósito: no se acota por carrera, y meterlo aquí
 * convertiría una cuenta de administración sin programas asignados en una
 * cuenta que no ve nada.
 */
export const ROLES_POR_PROGRAMA: Role[] = ['COORDINATOR', 'SECRETARY'];

/** Roles con vista institucional (por encima de un docente). */
export const ROLES_ADMINISTRATIVOS: Role[] = ['ADMIN', 'COORDINATOR', 'SECRETARY'];

export function esRolPorPrograma(role: string | undefined): boolean {
  return ROLES_POR_PROGRAMA.includes(role as Role);
}
