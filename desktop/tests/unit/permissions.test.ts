import { describe, expect, it } from 'vitest';
import { can, canAny } from '@/core/auth/permissions';

describe('can', () => {
  it('lets a professor manage grades and attendance', () => {
    expect(can('PROFESSOR', 'grades.write')).toBe(true);
    expect(can('PROFESSOR', 'attendance.write')).toBe(true);
  });

  it('stops a professor from deleting students', () => {
    // Deleting a student wipes grades and attendance across every subject, so
    // it stays with roles that own the academic record.
    expect(can('PROFESSOR', 'students.delete')).toBe(false);
    expect(can('ADMIN', 'students.delete')).toBe(true);
    expect(can('COORDINATOR', 'students.delete')).toBe(true);
  });

  it('gives a coordinator read access without grade capture', () => {
    expect(can('COORDINATOR', 'grades.read')).toBe(true);
    expect(can('COORDINATOR', 'grades.write')).toBe(false);
  });

  it('restricts students to reading their own academic data', () => {
    expect(can('STUDENT', 'grades.read')).toBe(true);
    expect(can('STUDENT', 'attendance.read')).toBe(true);
    expect(can('STUDENT', 'grades.write')).toBe(false);
    expect(can('STUDENT', 'students.read')).toBe(false);
    expect(can('STUDENT', 'analytics.risks')).toBe(false);
  });

  it('denies everything when the role is unknown', () => {
    expect(can(undefined, 'grades.read')).toBe(false);
  });
});

describe('capacidades administrativas nuevas', () => {
  it('la auditoría se queda en ADMIN', () => {
    // Contiene los cambios de todo el mundo; abrirla a coordinación la
    // convertiría en una forma cómoda de vigilar al personal.
    expect(can('ADMIN', 'audit.read')).toBe(true);
    expect(can('COORDINATOR', 'audit.read')).toBe(false);
    expect(can('PROFESSOR', 'audit.read')).toBe(false);
  });

  it('coordinación cierra periodos pero no los reabre', () => {
    // Reabrir un acta oficial es lo único que puede hacer que el consolidado
    // deje de coincidir con lo que ya se consultó.
    expect(can('COORDINATOR', 'periods.close')).toBe(true);
    expect(can('COORDINATOR', 'periods.reopen')).toBe(false);
    expect(can('ADMIN', 'periods.reopen')).toBe(true);
    expect(can('PROFESSOR', 'periods.close')).toBe(false);
  });

  it('un docente crea actividades pero no reabre las cerradas', () => {
    // Deshacer un cierre después de la fecha límite cambia lo que se le puede
    // exigir a un estudiante.
    expect(can('PROFESSOR', 'activities.write')).toBe(true);
    expect(can('PROFESSOR', 'activities.reopen')).toBe(false);
    expect(can('COORDINATOR', 'activities.reopen')).toBe(true);
  });

  it('un estudiante ve actividades y el estado del periodo, nada más', () => {
    expect(can('STUDENT', 'activities.read')).toBe(true);
    expect(can('STUDENT', 'activities.write')).toBe(false);
    expect(can('STUDENT', 'periods.read')).toBe(true);
    expect(can('STUDENT', 'periods.close')).toBe(false);
    expect(can('STUDENT', 'system.health')).toBe(false);
  });
});

describe('secretaría: coordinación sin escritura', () => {
  it('ve lo mismo que coordinación', () => {
    expect(can('SECRETARY', 'students.read')).toBe(true);
    expect(can('SECRETARY', 'grades.read')).toBe(true);
    expect(can('SECRETARY', 'attendance.read')).toBe(true);
    expect(can('SECRETARY', 'coordination.read')).toBe(true);
  });

  it('exporta, porque exportar es leer', () => {
    // Es la mitad del trabajo de una secretaría académica: quitarle la
    // exportación la deja mirando tablas que no puede llevarse a una reunión.
    expect(can('SECRETARY', 'reports.export')).toBe(true);
    expect(can('SECRETARY', 'coordination.export')).toBe(true);
  });

  it('no escribe nada', () => {
    expect(can('SECRETARY', 'grades.write')).toBe(false);
    expect(can('SECRETARY', 'attendance.write')).toBe(false);
    expect(can('SECRETARY', 'students.write')).toBe(false);
    expect(can('SECRETARY', 'students.delete')).toBe(false);
    expect(can('SECRETARY', 'activities.write')).toBe(false);
    expect(can('SECRETARY', 'periods.close')).toBe(false);
    expect(can('SECRETARY', 'professors.manage')).toBe(false);
  });

  it('no toca el personal ni la auditoría', () => {
    // Asignar programas define alcances: un rol no mueve su propio techo.
    expect(can('SECRETARY', 'staff.manage')).toBe(false);
    expect(can('COORDINATOR', 'staff.manage')).toBe(false);
    expect(can('ADMIN', 'staff.manage')).toBe(true);
    expect(can('SECRETARY', 'audit.read')).toBe(false);
  });
});

describe('perfiles institucionales', () => {
  it('solo ADMIN gestiona instituciones', () => {
    expect(can('ADMIN', 'institutions.manage')).toBe(true);
    expect(can('COORDINATOR', 'institutions.manage')).toBe(false);
    expect(can('SECRETARY', 'institutions.manage')).toBe(false);
    expect(can('PROFESSOR', 'institutions.manage')).toBe(false);
  });

  it('coordinación y secretaría leen, sin escribir', () => {
    expect(can('COORDINATOR', 'institutions.read')).toBe(true);
    expect(can('SECRETARY', 'institutions.read')).toBe(true);
    expect(can('SECRETARY', 'institutions.manage')).toBe(false);
  });
});

describe('canAny', () => {
  it('passes when at least one capability is granted', () => {
    expect(canAny('STUDENT', ['grades.write', 'grades.read'])).toBe(true);
    expect(canAny('STUDENT', ['grades.write', 'students.delete'])).toBe(false);
  });
});
