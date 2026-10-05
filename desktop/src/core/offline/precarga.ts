/**
 * Precarga en segundo plano (ver `domain/offline/precarga.ts`).
 *
 * Usa `prefetchQuery` con las mismas claves y funciones que las pantallas, de
 * modo que lo traído acaba en la caché y, por el persistidor, en el disco. Es
 * de mejor esfuerzo y silenciosa: un fallo no avisa de nada (`meta.silencioso`
 * la excluye del aviso global de `app/query-client.ts`) y simplemente se
 * reintenta en la próxima ocasión.
 */
import type { QueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/core/api/query-keys';
import {
  CONCURRENCIA_DE_PRECARGA,
  debePrecargar,
  tareasBase,
  tareasPorMateria,
  type TareaDePrecarga,
} from '@/domain/offline/precarga';
import {
  attendanceRepository,
  enrollmentRepository,
  gradeRepository,
  groupRepository,
  studentRepository,
  subjectRepository,
} from '@/infrastructure/repositories/academic.repository';
import { periodosRepository } from '@/infrastructure/repositories/administracion.repository';
import { analyticsRepository } from '@/infrastructure/repositories/insights.repository';
import type { Subject, Group } from '@/domain/schemas/academic';
import { currentPeriod } from '@/shared/lib/format';
import { useConectividad } from '@/state/connectivity.store';
import { useSession } from '@/state/session.store';
import { clienteRegistrado } from './cache';

/** Cuánto se considera fresco lo ya traído: no se repite lo que la pantalla acaba de pedir. */
const FRESCURA_MS = 10 * 60_000;

let enCurso = false;
let ultimaVez = 0;

function consulta(tarea: TareaDePrecarga): { queryKey: readonly unknown[]; queryFn: () => Promise<unknown> } {
  const scope = tarea.scope;
  switch (tarea.tipo) {
    case 'periods':
      return { queryKey: queryKeys.periods.list(), queryFn: () => periodosRepository.list() };
    case 'subjects':
      return { queryKey: queryKeys.subjects.list(), queryFn: () => subjectRepository.list() };
    case 'groups':
      return { queryKey: queryKeys.groups.list(), queryFn: () => groupRepository.list() };
    case 'students':
      return { queryKey: queryKeys.students.list(), queryFn: () => studentRepository.list(undefined) };
    case 'dashboard':
      return { queryKey: queryKeys.analytics.dashboard(), queryFn: () => analyticsRepository.dashboard() };
    case 'enrollments':
      return {
        queryKey: queryKeys.enrollments.list(scope!),
        queryFn: () => enrollmentRepository.list(scope!),
      };
    case 'consolidated':
      return {
        queryKey: queryKeys.grades.consolidated(scope!),
        queryFn: () => gradeRepository.consolidated(scope!),
      };
    case 'attendance': {
      // La pantalla de asistencia pide por materia y periodo, sin grupo.
      const ambito = { subjectId: scope!.subjectId, period: scope!.period };
      return {
        queryKey: queryKeys.attendance.list(ambito),
        queryFn: () => attendanceRepository.list(ambito),
      };
    }
  }
}

/** Ejecuta las tareas con un máximo de consultas simultáneas; para si se pierde la conexión. */
async function correr(client: QueryClient, tareas: TareaDePrecarga[]): Promise<void> {
  const cola = [...tareas];
  const trabajador = async () => {
    for (;;) {
      if (!useConectividad.getState().online) return;
      const tarea = cola.shift();
      if (!tarea) return;
      const { queryKey, queryFn } = consulta(tarea);
      await client.prefetchQuery({
        queryKey,
        queryFn,
        staleTime: FRESCURA_MS,
        meta: { silencioso: true },
      });
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCIA_DE_PRECARGA }, trabajador));
}

/**
 * Precarga lo que un docente necesita para trabajar sin conexión, si toca:
 * es docente, hay servidor, no hay otra en marcha y pasaron 30 minutos.
 * Segura de llamar desde cualquier disparador.
 */
export async function precargar(): Promise<void> {
  const client = clienteRegistrado();
  const sesion = useSession.getState();
  const ahora = Date.now();

  if (
    !client ||
    sesion.status !== 'authenticated' ||
    sesion.desdeCache ||
    !debePrecargar({
      rol: sesion.user?.role,
      enLinea: useConectividad.getState().online,
      enCurso,
      ultimaVez,
      ahora,
    })
  ) {
    return;
  }

  enCurso = true;
  ultimaVez = ahora;
  try {
    await correr(client, tareasBase());

    const materias = client.getQueryData<Subject[]>(queryKeys.subjects.list()) ?? [];
    const grupos = client.getQueryData<Group[]>(queryKeys.groups.list()) ?? [];
    await correr(
      client,
      tareasPorMateria({ periodo: currentPeriod(), materias, grupos }),
    );

    // Si se cortó la conexión a medias, la próxima vez que vuelva se completa.
    if (!useConectividad.getState().online) ultimaVez = 0;
  } catch {
    ultimaVez = 0;
  } finally {
    enCurso = false;
  }
}

/** Dispara la precarga sin esperarla y sin que pueda fallar hacia fuera. */
export function programarPrecarga(retrasoMs = 2_000): void {
  window.setTimeout(() => void precargar().catch(() => undefined), retrasoMs);
}

/** Para pruebas y para el cierre de sesión: el siguiente usuario empieza de cero. */
export function reiniciarPrecarga(): void {
  ultimaVez = 0;
  enCurso = false;
}
