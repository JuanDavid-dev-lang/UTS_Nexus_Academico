import { describe, expect, it } from 'vitest';
import {
  TURNO_MINIMO_MS,
  TURNO_POR_DEFECTO_MS,
  duracionDelTurnoMs,
  filtroDeTurno,
} from '../src/shared/turno-tarea.js';

describe('duracionDelTurnoMs', () => {
  it('dura dos intervalos y medio', () => {
    expect(duracionDelTurnoMs(30)).toBe(75 * 60_000);
  });

  it('una tarea de cada minuto no baja del mínimo', () => {
    expect(duracionDelTurnoMs(1)).toBe(TURNO_MINIMO_MS);
  });

  it('sin intervalo conocido usa el turno por defecto', () => {
    expect(duracionDelTurnoMs(0)).toBe(TURNO_POR_DEFECTO_MS);
    expect(duracionDelTurnoMs(Number.NaN)).toBe(TURNO_POR_DEFECTO_MS);
  });
});

describe('filtroDeTurno', () => {
  it('casa con un turno libre, vencido o propio, y con nada más', () => {
    const ahora = new Date('2026-11-25T12:00:00Z');
    const filtro = filtroDeTurno('class-reminders', 'server1#10', ahora);
    expect(filtro.job).toBe('class-reminders');
    expect(filtro.$or).toEqual([
      { leaseUntil: null },
      { leaseUntil: { $exists: false } },
      { leaseUntil: { $lte: ahora } },
      { leaseHolder: 'server1#10' },
    ]);
  });
});
