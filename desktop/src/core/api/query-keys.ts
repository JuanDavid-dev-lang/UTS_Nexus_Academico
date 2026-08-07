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
    list: (scope?: Scope & { q?: string }) =>
      scope ? (['students', 'list', scope] as const) : (['students', 'list'] as const),
    // El directorio global no se invalida con el resto: es una búsqueda, no una
    // vista del estado del docente.
    search: (q: string) => ['students', 'search', q] as const,
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
    // Cuelga de `grades.all` a propósito: guardar o borrar una nota cambia lo
    // que falta, así que se invalida con el mismo gesto que el consolidado.
    pending: (period: string, subjectId?: string) =>
      ['grades', 'pending', period, subjectId ?? null] as const,
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

  // Los avisos usaban la clave literal `['avisos']` escrita en cada pantalla, y
  // por eso el mapa de invalidación en tiempo real no podía referirse a ellos.
  announcements: {
    all: ['avisos'] as const,
  },

  assistant: {
    all: ['assistant'] as const,
    status: () => ['assistant', 'status'] as const,
  },

  // El catálogo de registro se pedía con la clave literal `['registro',
  // 'catalogo']` escrita en dos pantallas. El backend emite `registration`
  // cuando el coordinador cambia el interruptor o el catálogo, pero sin una
  // entrada aquí el mapa de invalidación no tenía a qué apuntar y la pantalla
  // seguía ofreciendo el catálogo viejo.
  registro: {
    all: ['registro'] as const,
    catalogo: () => ['registro', 'catalogo'] as const,
  },
} as const;
