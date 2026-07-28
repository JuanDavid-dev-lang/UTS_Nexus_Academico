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

describe('canAny', () => {
  it('passes when at least one capability is granted', () => {
    expect(canAny('STUDENT', ['grades.write', 'grades.read'])).toBe(true);
    expect(canAny('STUDENT', ['grades.write', 'students.delete'])).toBe(false);
  });
});
