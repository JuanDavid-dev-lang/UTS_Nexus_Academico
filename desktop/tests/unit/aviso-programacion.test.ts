import { describe, expect, it } from 'vitest';
import { aInputLocal, fechasDeAviso } from '@/domain/announcements/programacion';

const AHORA = new Date(2026, 10, 25, 10, 0);
const local = (y: number, m: number, d: number, h: number, min = 0) =>
  aInputLocal(new Date(y, m, d, h, min).toISOString());

describe('fechasDeAviso', () => {
  it('publicar ahora no manda fecha de publicación', () => {
    expect(fechasDeAviso({ modo: 'ahora', publicarEn: '', caducaEn: '' }, AHORA)).toEqual({
      ok: true,
      publicadoEn: undefined,
      expiraEn: null,
    });
  });

  it('programar exige una fecha futura', () => {
    expect(fechasDeAviso({ modo: 'programar', publicarEn: '', caducaEn: '' }, AHORA).ok).toBe(false);
    expect(
      fechasDeAviso({ modo: 'programar', publicarEn: local(2026, 10, 25, 9), caducaEn: '' }, AHORA).ok,
    ).toBe(false);
    const r = fechasDeAviso({ modo: 'programar', publicarEn: local(2026, 10, 26, 7), caducaEn: '' }, AHORA);
    expect(r).toEqual({ ok: true, publicadoEn: new Date(2026, 10, 26, 7).toISOString(), expiraEn: null });
  });

  it('la caducidad tiene que ser posterior a la publicación', () => {
    const programado = { modo: 'programar' as const, publicarEn: local(2026, 10, 26, 7) };
    expect(fechasDeAviso({ ...programado, caducaEn: local(2026, 10, 26, 7) }, AHORA).ok).toBe(false);
    expect(fechasDeAviso({ ...programado, caducaEn: local(2026, 10, 30, 7) }, AHORA).ok).toBe(true);
    // Con «ahora», se compara con el momento actual.
    expect(fechasDeAviso({ modo: 'ahora', publicarEn: '', caducaEn: local(2026, 10, 25, 9) }, AHORA).ok).toBe(false);
  });
});

describe('aInputLocal', () => {
  it('vuelve vacío lo que no es fecha', () => {
    expect(aInputLocal(null)).toBe('');
    expect(aInputLocal('no')).toBe('');
  });
});
