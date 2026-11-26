import { describe, expect, it } from 'vitest';
import {
  diaDelCampus,
  inicioDePeriodoPorDefecto,
  periodoDeCalendario,
  periodoVigente,
  rangoDePeriodoValido,
} from '../src/domains/periods/period-current.js';

/**
 * Qué semestre corre. Si esto se equivoca, las pantallas de los tres clientes
 * abren en otro semestre y las notas parecen haberse borrado: no hay error,
 * solo una lista vacía.
 */
const COLOMBIA = -300;
/** Mediodía del campus de un día. */
const dia = (iso: string) => new Date(`${iso}T17:00:00Z`);

describe('diaDelCampus y calendario', () => {
  it('mide el día en la zona del campus, no en UTC', () => {
    // 1 de julio 02:00 UTC es todavía 30 de junio en Colombia.
    expect(diaDelCampus(new Date('2026-07-01T02:00:00Z'), COLOMBIA)).toBe('2026-06-30');
  });

  it('enero–junio es el ciclo 1 y julio–diciembre el 2', () => {
    expect(periodoDeCalendario('2026-01-01')).toBe('2026-1');
    expect(periodoDeCalendario('2026-06-30')).toBe('2026-1');
    expect(periodoDeCalendario('2026-07-01')).toBe('2026-2');
    expect(periodoDeCalendario('2026-12-31')).toBe('2026-2');
  });

  it('inicio por defecto solo para los dos semestres', () => {
    expect(inicioDePeriodoPorDefecto('2026-1')).toBe('2026-01-01');
    expect(inicioDePeriodoPorDefecto('2026-2')).toBe('2026-07-01');
    expect(inicioDePeriodoPorDefecto('2026-3')).toBeNull();
  });
});

describe('periodoVigente', () => {
  it('sin nada configurado usa el calendario', () => {
    expect(periodoVigente([], dia('2026-11-25'), COLOMBIA)).toEqual({
      period: '2026-2',
      startsOn: '2026-07-01',
      endsOn: '2026-12-20',
      origen: 'calendario',
    });
  });

  it('el periodo configurado que contiene el día manda', () => {
    const r = periodoVigente(
      [{ period: '2026-2', startsOn: '2026-08-10', endsOn: '2026-12-17' }],
      dia('2026-09-01'),
      COLOMBIA,
    );
    expect(r).toMatchObject({ period: '2026-2', origen: 'configurado', startsOn: '2026-08-10' });
  });

  it('un semestre que se alarga más allá de junio sigue vigente en julio', () => {
    const r = periodoVigente(
      [{ period: '2026-1', startsOn: '2026-02-09', endsOn: '2026-07-25' }],
      dia('2026-07-10'),
      COLOMBIA,
    );
    expect(r.period).toBe('2026-1');
    expect(r.origen).toBe('configurado');
  });

  it('en el hueco, el siguiente que ya tiene inicio configurado', () => {
    const r = periodoVigente(
      [
        { period: '2026-1', startsOn: '2026-02-09', endsOn: '2026-06-26' },
        { period: '2026-2', startsOn: '2026-08-10', endsOn: '2026-12-17' },
      ],
      dia('2026-07-15'),
      COLOMBIA,
    );
    expect(r).toMatchObject({ period: '2026-2', origen: 'configurado' });
  });

  it('en el hueco sin siguiente configurado, el de calendario', () => {
    const r = periodoVigente(
      [{ period: '2026-2', startsOn: '2026-08-10', endsOn: '2026-12-17' }],
      dia('2026-12-23'),
      COLOMBIA,
    );
    expect(r).toMatchObject({ period: '2026-2', origen: 'calendario' });
  });

  it('un periodo siguiente creado de antemano no adelanta el actual', () => {
    const r = periodoVigente(
      [{ period: '2027-1', startsOn: '2027-02-08', endsOn: '2027-06-25' }],
      dia('2026-11-25'),
      COLOMBIA,
    );
    expect(r.period).toBe('2026-2');
    expect(r.origen).toBe('calendario');
  });

  it('solo con fin configurado rellena el inicio por defecto', () => {
    const r = periodoVigente([{ period: '2026-2', endsOn: '2026-12-17' }], dia('2026-07-02'), COLOMBIA);
    expect(r).toEqual({ period: '2026-2', startsOn: '2026-07-01', endsOn: '2026-12-17', origen: 'configurado' });
  });

  it('ignora periodos con forma o fechas inválidas', () => {
    const r = periodoVigente(
      [
        { period: '2026-9', startsOn: '2026-01-01', endsOn: '2026-12-31' },
        { period: '2026-2', startsOn: '2026-02-31', endsOn: null },
      ],
      dia('2026-11-25'),
      COLOMBIA,
    );
    expect(r).toMatchObject({ period: '2026-2', origen: 'calendario' });
  });
});

describe('rangoDePeriodoValido', () => {
  it('rechaza un inicio posterior al fin, también contra el fin por defecto', () => {
    expect(rangoDePeriodoValido({ period: '2026-2', startsOn: '2026-08-10', endsOn: '2026-12-17' })).toBe(true);
    expect(rangoDePeriodoValido({ period: '2026-2', startsOn: '2026-12-18', endsOn: '2026-12-17' })).toBe(false);
    expect(rangoDePeriodoValido({ period: '2026-2', startsOn: '2026-12-25' })).toBe(false);
  });
});
