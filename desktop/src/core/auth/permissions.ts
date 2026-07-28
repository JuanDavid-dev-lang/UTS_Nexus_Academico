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
  | 'analytics.risks';

const MATRIX: Record<Role, Capability[]> = {
  ADMIN: [
    'students.read', 'students.write', 'students.delete',
    'subjects.read', 'subjects.write', 'subjects.delete',
    'grades.read', 'grades.write',
    'attendance.read', 'attendance.write',
    'reports.export', 'notifications.scan', 'assistant.use', 'analytics.risks',
  ],
  COORDINATOR: [
    'students.read', 'students.write', 'students.delete',
    'subjects.read',
    'grades.read',
    'attendance.read',
    'reports.export', 'notifications.scan', 'assistant.use', 'analytics.risks',
  ],
  PROFESSOR: [
    'students.read', 'students.write',
    'subjects.read', 'subjects.write',
    'grades.read', 'grades.write',
    'attendance.read', 'attendance.write',
    'reports.export', 'notifications.scan', 'assistant.use', 'analytics.risks',
  ],
  STUDENT: ['grades.read', 'attendance.read'],
};

export function can(role: Role | undefined, capability: Capability): boolean {
  if (!role) return false;
  return MATRIX[role].includes(capability);
}

export function canAny(role: Role | undefined, capabilities: Capability[]): boolean {
  return capabilities.some((capability) => can(role, capability));
}
