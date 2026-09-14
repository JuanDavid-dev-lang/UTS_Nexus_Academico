/**
 * Role-based capabilities.
 *
 * The server is the authority - every endpoint re-checks the role. This module
 * exists so the UI does not offer buttons that will fail with a 403: showing an
 * action the user cannot perform is a UX bug, not a security control.
 */
import type { Role } from '@/domain/schemas/common';

export type Capability =
  | 'students.read'
  | 'students.write'
  | 'students.delete'
  | 'subjects.read'
  | 'subjects.write'
  | 'subjects.delete'
  | 'grades.read'
  | 'grades.write'
  | 'attendance.read'
  | 'attendance.write'
  | 'reports.export'
  | 'notifications.scan'
  | 'assistant.use'
  | 'analytics.risks'
  // Anotar el seguimiento de un estudiante en riesgo o de un caso de
  // inasistencia. Ver el riesgo es leer; anotar qué se hizo es escribir, y
  // secretaría lee pero no escribe.
  | 'analytics.intervene'
  | 'professors.manage'
  | 'activities.read'
  | 'activities.write'
  // Reabrir una actividad cerrada cambia lo que se le puede exigir a un
  // estudiante después de la fecha límite: no es del docente.
  | 'activities.reopen'
  | 'periods.read'
  | 'periods.close'
  | 'periods.reopen'
  | 'audit.read'
  | 'system.health'
  | 'telemetry.read'
  | 'telemetry.manage'
  // Panorama de las carreras a cargo: materias con su docente, docentes y
  // grupos. Es lo que separa a coordinación y secretaría de un docente.
  | 'coordination.read'
  | 'coordination.export'
  // Alta y edición del personal: quién es qué rol y de qué programas responde.
  // Solo ADMIN: quien asigna programas decide alcances, y un rol no puede mover
  // su propio techo.
  | 'staff.manage'
  // Perfiles institucionales: crear, editar, configurar cortes/ponderados y
  // reasignar docentes. Solo ADMIN, igual que el backend (`/instituciones`
  // fuera de las lecturas es ADMIN-only).
  | 'institutions.manage'
  // Ver el catálogo y los docentes por institución. Coordinación y secretaría
  // lo necesitan para entender de dónde viene un docente; ninguna de las dos
  // escribe.
  | 'institutions.read'
  // Vínculos de UniPlanner: el enlace de cada estudiante con su universidad.
  // Es institucional —uno por persona, vale para todas sus materias—, así que
  // lo ve y lo gestiona la institución, no el docente de un curso. Secretaría
  // lo consulta.
  | 'uniplanner.links.read'
  | 'uniplanner.links.manage';

const MATRIX: Record<Role, Capability[]> = {
  ADMIN: [
    'students.read', 'students.write', 'students.delete',
    'subjects.read', 'subjects.write', 'subjects.delete',
    'grades.read', 'grades.write',
    'attendance.read', 'attendance.write',
    'reports.export', 'notifications.scan', 'assistant.use', 'analytics.risks', 'analytics.intervene',
    'professors.manage',
    'activities.read', 'activities.write', 'activities.reopen',
    'periods.read', 'periods.close', 'periods.reopen',
    'audit.read', 'system.health', 'telemetry.read', 'telemetry.manage',
    'coordination.read', 'coordination.export', 'staff.manage',
    'institutions.manage', 'institutions.read',
    'uniplanner.links.read', 'uniplanner.links.manage',
  ],
  COORDINATOR: [
    'students.read', 'students.write', 'students.delete',
    'subjects.read',
    'grades.read',
    'attendance.read',
    'reports.export', 'notifications.scan', 'assistant.use', 'analytics.risks', 'analytics.intervene',
    'professors.manage',
    'activities.read', 'activities.write', 'activities.reopen',
    // Ve el estado y el acta de sus carreras, pero no cierra ni reabre: el
    // periodo es global —el mismo `2026-2` para todas las universidades— y
    // cerrarlo bloquea las notas de todas. Es de ADMIN, igual que en el backend.
    'periods.read',
    // La auditoría no: contiene los cambios de todo el mundo, y abrirla a
    // coordinación la convertiría en una forma cómoda de vigilar al personal.
    'system.health', 'telemetry.read',
    'coordination.read', 'coordination.export',
    'institutions.read',
    'uniplanner.links.read', 'uniplanner.links.manage',
  ],
  /**
   * Secretaría: **lo mismo que coordinación, sin una sola escritura.**
   *
   * Esta lista no se deriva de la de coordinación quitando verbos porque una
   * derivación automática daría por sentado que toda capacidad nueva es de
   * lectura hasta que alguien demuestre lo contrario, y ese es justo el error
   * que hay que evitar: el que se equivoca concediendo. Escrita a mano, una
   * capacidad nueva no llega aquí sola.
   *
   * El servidor corta igual (`domains/scope/role-access.ts`): esto solo evita
   * ofrecer botones que iban a responder 403.
   */
  SECRETARY: [
    'students.read',
    'subjects.read',
    'grades.read',
    'attendance.read',
    // Exportar es leer, y es la mitad del trabajo de una secretaría académica.
    'reports.export',
    'analytics.risks',
    // Preguntar al asistente es leer: el backend la nombra en `/ai/chat` y
    // `/ai/quick` y los deja en su lista blanca de escritura.
    'assistant.use',
    'activities.read',
    'periods.read',
    'coordination.read', 'coordination.export',
    'institutions.read',
    'uniplanner.links.read',
  ],
  PROFESSOR: [
    'students.read', 'students.write',
    'subjects.read', 'subjects.write',
    'grades.read', 'grades.write',
    'attendance.read', 'attendance.write',
    'reports.export', 'notifications.scan', 'assistant.use', 'analytics.risks', 'analytics.intervene',
    'activities.read', 'activities.write',
    // Ve en qué estado está el periodo para no intentar guardar en uno cerrado.
    'periods.read',
  ],
  STUDENT: ['grades.read', 'attendance.read', 'activities.read', 'periods.read'],
};

export function can(role: Role | undefined, capability: Capability): boolean {
  if (!role) return false;
  return MATRIX[role].includes(capability);
}

export function canAny(role: Role | undefined, capabilities: Capability[]): boolean {
  return capabilities.some((capability) => can(role, capability));
}
