/**
 * Tramos de la línea de tiempo de actividades.
 *
 * Lo que importa fijar: «Vencidas» sale SOLO del estado del servidor. Una
 * actividad que este equipo cree pasada pero que el servidor da por abierta no
 * se pinta como vencida.
 */
import { describe, expect, it } from 'vitest';
import { agruparActividades, contarPorEstado, tramoDe } from '@/domain/activities/linea-de-tiempo';
import type { Actividad } from '@/domain/schemas/activities';

const OFFSET = -300;
// 10 nov 2026, 10:00 en el campus (15:00 UTC).
const AHORA = new Date('2026-11-10T15:00:00Z');

function actividad(id: string, dueAt: string, estado: Actividad['estado'] = 'OPEN'): Actividad {
  return {
    _id: id,
    title: id,
    description: '',
    subjectId: 's1',
    groupId: null,
    teacherId: 't1',
    period: '2026-2',
    dueAt,
    weight: 0,
    attachmentUrl: null,
    status: estado === 'CLOSED' ? 'CLOSED' : 'OPEN',
    estado,
    vencida: estado === 'LATE',
  } as Actividad;
}

describe('tramoDe', () => {
  it('respeta el estado del servidor para vencidas y cerradas', () => {
    expect(tramoDe(actividad('a', '2026-11-20T15:00:00Z', 'LATE'), AHORA, OFFSET)).toBe('VENCIDAS');
    expect(tramoDe(actividad('b', '2026-11-01T15:00:00Z', 'CLOSED'), AHORA, OFFSET)).toBe('CERRADAS');
  });

  it('no marca vencida una abierta aunque el reloj local diga que ya pasó', () => {
    expect(tramoDe(actividad('a', '2026-11-08T15:00:00Z'), AHORA, OFFSET)).toBe('HOY');
  });

  it('usa el día del campus, no el UTC', () => {
    // 11 nov 03:00 UTC = 10 nov 22:00 en el campus: vence hoy.
    expect(tramoDe(actividad('a', '2026-11-11T03:00:00Z'), AHORA, OFFSET)).toBe('HOY');
    // 11 nov 06:00 UTC = 11 nov 01:00 en el campus: mañana.
    expect(tramoDe(actividad('b', '2026-11-11T06:00:00Z'), AHORA, OFFSET)).toBe('MANANA');
  });

  it('separa la semana de lo que queda más adelante', () => {
    expect(tramoDe(actividad('a', '2026-11-17T15:00:00Z'), AHORA, OFFSET)).toBe('SEMANA');
    expect(tramoDe(actividad('b', '2026-11-18T15:00:00Z'), AHORA, OFFSET)).toBe('DESPUES');
  });
});

describe('agruparActividades', () => {
  it('ordena los grupos por urgencia y omite los vacíos', () => {
    const grupos = agruparActividades(
      [
        actividad('lejos', '2026-12-01T15:00:00Z'),
        actividad('cerrada', '2026-11-01T15:00:00Z', 'CLOSED'),
        actividad('vencida', '2026-11-09T15:00:00Z', 'LATE'),
        actividad('hoy', '2026-11-10T20:00:00Z'),
      ],
      AHORA,
      OFFSET,
    );
    expect(grupos.map((grupo) => grupo.tramo)).toEqual(['VENCIDAS', 'HOY', 'DESPUES', 'CERRADAS']);
  });

  it('dentro de un grupo va por fecha límite; las cerradas, la más reciente primero', () => {
    const grupos = agruparActividades(
      [
        actividad('d2', '2026-12-05T15:00:00Z'),
        actividad('d1', '2026-12-01T15:00:00Z'),
        actividad('c1', '2026-10-01T15:00:00Z', 'CLOSED'),
        actividad('c2', '2026-10-20T15:00:00Z', 'CLOSED'),
      ],
      AHORA,
      OFFSET,
    );
    expect(grupos[0]?.items.map((item) => item._id)).toEqual(['d1', 'd2']);
    expect(grupos[1]?.items.map((item) => item._id)).toEqual(['c2', 'c1']);
  });
});

describe('contarPorEstado', () => {
  it('cuenta por el estado del servidor', () => {
    expect(
      contarPorEstado([
        actividad('a', '2026-11-20T15:00:00Z'),
        actividad('b', '2026-11-20T15:00:00Z', 'LATE'),
        actividad('c', '2026-11-20T15:00:00Z', 'LATE'),
      ]),
    ).toEqual({ OPEN: 1, LATE: 2, CLOSED: 0 });
  });
});
