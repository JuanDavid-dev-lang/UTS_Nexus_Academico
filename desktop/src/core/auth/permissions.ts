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
  | 'telemetry.manage';

const MATRIX: Record<Role, Capability[]> = {
  ADMIN: [
    'students.read', 'students.write', 'students.delete',
    'subjects.read', 'subjects.write', 'subjects.delete',
    'grades.read', 'grades.write',
    'attendance.read', 'attendance.write',
    'reports.export', 'notifications.scan', 'assistant.use', 'analytics.risks',
    'professors.manage',
    'activities.read', 'activities.write', 'activities.reopen',
    'periods.read', 'periods.close', 'periods.reopen',
    'audit.read', 'system.health', 'telemetry.read', 'telemetry.manage',
  ],
  COORDINATOR: [
    'students.read', 'students.write', 'students.delete',
    'subjects.read',
    'grades.read',
    'attendance.read',
    'reports.export', 'notifications.scan', 'assistant.use', 'analytics.risks',
    'professors.manage',
    'activities.read', 'activities.write', 'activities.reopen',
    // Cierra periodos, pero no los reabre: deshacer un acta oficial se queda
    // en ADMIN, igual que en el backend.
    'periods.read', 'periods.close',
    // La auditoría no: contiene los cambios de todo el mundo, y abrirla a
    // coordinación la convertiría en una forma cómoda de vigilar al personal.
    'system.health', 'telemetry.read',
  ],
  PROFESSOR: [
    'students.read', 'students.write',
    'subjects.read', 'subjects.write',
    'grades.read', 'grades.write',
    'attendance.read', 'attendance.write',
    'reports.export', 'notifications.scan', 'assistant.use', 'analytics.risks',
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
