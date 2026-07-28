/**
 * Central registry of React Query cache keys.
 *
 * Keys defined inline across features drift and stop matching, which makes
 * invalidation silently fail - the screen keeps showing stale data and nobody
 * notices. One registry keeps every producer and consumer in agreement.
 */
import type { Scope } from '@/domain/repositories/ports';

export const queryKeys = {
  auth: {
    all: ['auth'] as const,
    me: () => ['auth', 'me'] as const,
  },

  students: {
    all: ['students'] as const,
    list: () => ['students', 'list'] as const,
  },

  subjects: {
    all: ['subjects'] as const,
    list: () => ['subjects', 'list'] as const,
  },

  groups: {
    all: ['groups'] as const,
    list: () => ['groups', 'list'] as const,
  },

  enrollments: {
    all: ['enrollments'] as const,
    list: (scope: Scope) => ['enrollments', 'list', scope] as const,
  },

  grades: {
    all: ['grades'] as const,
    list: (scope: Scope) => ['grades', 'list', scope] as const,
    consolidated: (scope: Scope) => ['grades', 'consolidated', scope] as const,
  },

  attendance: {
    all: ['attendance'] as const,
    list: (scope: Scope) => ['attendance', 'list', scope] as const,
    summary: (studentId: string) => ['attendance', 'summary', studentId] as const,
  },

  analytics: {
    all: ['analytics'] as const,
    dashboard: () => ['analytics', 'dashboard'] as const,
    risks: () => ['analytics', 'risks'] as const,
  },

  notifications: {
    all: ['notifications'] as const,
    list: () => ['notifications', 'list'] as const,
  },

  assistant: {
    all: ['assistant'] as const,
    status: () => ['assistant', 'status'] as const,
  },
} as const;
