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

  /**
   * Vista de coordinación. Las cuatro consultas cuelgan de la misma raíz
   * porque miran el mismo conjunto de datos: si una nota cambia, el promedio de
   * la materia, el del docente y el del grupo cambian a la vez, y tenerlas en
   * ramas distintas dejaría dos de las tres desactualizadas en pantalla.
   */
  coordination: {
    all: ['coordination'] as const,
    programas: () => ['coordination', 'programas'] as const,
    resumen: (filtro: unknown) => ['coordination', 'resumen', filtro] as const,
    materias: (filtro: unknown) => ['coordination', 'materias', filtro] as const,
    docentes: (filtro: unknown) => ['coordination', 'docentes', filtro] as const,
    grupos: (filtro: unknown) => ['coordination', 'grupos', filtro] as const,
  },

  users: {
    all: ['users'] as const,
    roles: () => ['users', 'roles'] as const,
    list: (filtro: unknown) => ['users', 'list', filtro] as const,
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
    seguimientos: (scope: { studentId: string; subjectId: string; period: string }) =>
      ['analytics', 'seguimientos', scope] as const,
  },

  notifications: {
    all: ['notifications'] as const,
    list: () => ['notifications', 'list'] as const,
    // Cuelga aparte de `list`: cambiar una preferencia no invalida la bandeja,
    // y marcar una leída no tiene por qué recargar los interruptores.
    preferences: () => ['notifications', 'preferences'] as const,
  },

  /**
   * Agenda. La clave del rango incluye las dos fechas en ISO porque cada semana
   * es una consulta distinta: con una clave fija, pasar de semana mostraría la
   * anterior hasta que llegara la respuesta.
   */
  agenda: {
    all: ['agenda'] as const,
    range: (desde: string, hasta: string, subjectId?: string) =>
      ['agenda', 'range', desde, hasta, subjectId ?? null] as const,
    summary: () => ['agenda', 'summary'] as const,
    events: (desde: string, hasta: string) => ['agenda', 'events', desde, hasta] as const,
  },

  schedules: {
    all: ['schedules'] as const,
    list: () => ['schedules', 'list'] as const,
  },

  // Los avisos usaban la clave literal `['avisos']` escrita en cada pantalla, y
  // por eso el mapa de invalidación en tiempo real no podía referirse a ellos.
  announcements: {
    all: ['avisos'] as const,
  },

  feedback: {
    all: ['feedback'] as const,
  },

  professors: {
    all: ['professors'] as const,
    list: (filtro?: { q?: string; programa?: string }) =>
      filtro ? (['professors', 'list', filtro] as const) : (['professors', 'list'] as const),
  },

  thesisFormats: {
    all: ['thesis-formats'] as const,
    list: (filtro?: { etapa?: string; q?: string }) =>
      filtro ? (['thesis-formats', 'list', filtro] as const) : (['thesis-formats', 'list'] as const),
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

  profile: {
    all: ['profile'] as const,
    me: () => ['profile', 'me'] as const,
  },

  /**
   * Periodos académicos. `list` no lleva parámetros porque el selector los
   * necesita todos; `fotografia` sí, porque cada combinación es otra consulta.
   */
  periods: {
    all: ['periods'] as const,
    list: () => ['periods', 'list'] as const,
    detail: (period: string) => ['periods', 'detail', period] as const,
    snapshot: (period: string, filtro?: Record<string, unknown>) =>
      ['periods', 'snapshot', period, filtro ?? null] as const,
  },

  activities: {
    all: ['activities'] as const,
    list: (filtro?: Record<string, unknown>) =>
      filtro ? (['activities', 'list', filtro] as const) : (['activities', 'list'] as const),
    detail: (id: string) => ['activities', 'detail', id] as const,
  },

  /** Casos abiertos por patrón de inasistencia. */
  attendanceCases: {
    all: ['attendance-cases'] as const,
    list: (filtro?: Record<string, unknown>) =>
      filtro
        ? (['attendance-cases', 'list', filtro] as const)
        : (['attendance-cases', 'list'] as const),
  },

  /**
   * Historial del estudiante. La clave incluye el estudiante y el filtro: sin
   * el id, abrir la ficha de otro mostraría el historial del anterior hasta
   * que llegara la respuesta.
   */
  timeline: {
    all: ['timeline'] as const,
    student: (studentId: string, filtro?: Record<string, unknown>) =>
      ['timeline', studentId, filtro ?? null] as const,
  },

  audit: {
    all: ['audit'] as const,
    list: (filtro?: Record<string, unknown>) =>
      filtro ? (['audit', 'list', filtro] as const) : (['audit', 'list'] as const),
    detail: (id: string) => ['audit', 'detail', id] as const,
    catalogo: () => ['audit', 'catalogo'] as const,
  },

  system: {
    all: ['system'] as const,
    health: () => ['system', 'health'] as const,
  },

  telemetry: {
    all: ['telemetry'] as const,
    list: (filtro?: Record<string, unknown>) =>
      filtro ? (['telemetry', 'list', filtro] as const) : (['telemetry', 'list'] as const),
  },

  // Vista previa de reportes: consulta bajo demanda al abrir el diálogo. La
  // clave incluye el alcance porque cada combinación periodo/materia es una
  // consulta distinta.
  reports: {
    all: ['reports'] as const,
    previewAttendance: (scope: Scope) => ['reports', 'preview', 'attendance', scope] as const,
    template: () => ['reports', 'template'] as const,
  },
} as const;
