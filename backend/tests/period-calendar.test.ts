import { describe, expect, it } from 'vitest';
import {
  DIAS_DE_BLOQUEO_SIN_CALENDARIO,
  debeRenovarBloqueo,
  esFinDePeriodoValido,
  finDePeriodoPorDefecto,
  finDelBloqueo,
  finDelDiaEnElCampus,
} from '../src/domains/periods/period-calendar.js';

/**
 * Hasta cuándo queda fijo el enlace de UniPlanner de quien marca asistencia.
 *
 * Se rompe en silencio por los dos lados: demasiado corto, y un estudiante
 * cambia su código por el de un compañero a mitad de semestre; demasiado largo,
 * y quien de verdad necesita corregirlo en vacaciones no puede.
 */
const COLOMBIA = -300;
const MS_DIA = 86_400_000;

describe('fin del semestre por defecto', () => {
  it('cubre el calendario de la UTS con margen', () => {
    // UTS 2026-1: notas de habilitación hasta el 26 de junio.
    expect(finDePeriodoPorDefecto('2026-1')).toBe('2026-06-30');
    // UTS 2026-2: notas de habilitación hasta el 17 de diciembre.
    expect(finDePeriodoPorDefecto('2026-2')).toBe('2026-12-20');
  });

  it('un intersemestral o un periodo mal formado no tiene fecha por defecto', () => {
    expect(finDePeriodoPorDefecto('2026-3')).toBeNull();
    expect(finDePeriodoPorDefecto('2026')).toBeNull();
  });
});

describe('fin del bloqueo', () => {
  const agosto = new Date('2026-08-20T15:00:00.000Z');

  it('dura hasta el último día del semestre, entero, en la hora del campus', () => {
    const fin = finDelBloqueo({ periodo: '2026-2', finConfigurado: null, ahora: agosto, offsetMinutos: COLOMBIA });
    // 20 de diciembre a las 23:59:59.999 en Colombia.
    expect(fin.toISOString()).toBe('2026-12-21T04:59:59.999Z');
  });

  it('la fecha que pone la administración manda sobre la de por defecto', () => {
    const fin = finDelBloqueo({ periodo: '2026-2', finConfigurado: '2026-12-17', ahora: agosto, offsetMinutos: COLOMBIA });
    expect(fin.toISOString()).toBe('2026-12-18T04:59:59.999Z');
  });

  it('una fecha configurada que no existe no se usa', () => {
    const fin = finDelBloqueo({ periodo: '2026-2', finConfigurado: '2026-02-31', ahora: agosto, offsetMinutos: COLOMBIA });
    expect(fin.toISOString()).toBe('2026-12-21T04:59:59.999Z');
  });

  it('después del cierre, o sin calendario, se fija un plazo en vez de nada', () => {
    const enero = new Date('2027-01-10T15:00:00.000Z');
    for (const periodo of ['2026-2', '2026-3']) {
      const fin = finDelBloqueo({ periodo, finConfigurado: null, ahora: enero, offsetMinutos: COLOMBIA });
      expect(fin.getTime() - enero.getTime(), periodo).toBe(DIAS_DE_BLOQUEO_SIN_CALENDARIO * MS_DIA);
    }
  });

  it('el último día cuenta entero', () => {
    const fin = finDelDiaEnElCampus('2026-06-30', COLOMBIA);
    expect(fin.getTime()).toBeGreaterThan(new Date('2026-07-01T04:59:00.000Z').getTime());
    expect(fin.getTime()).toBeLessThan(new Date('2026-07-01T05:00:00.000Z').getTime());
  });
});

describe('renovar el bloqueo', () => {
  const objetivo = new Date('2026-12-21T04:59:59.999Z');

  it('se escribe una vez por semestre, no en cada clase', () => {
    expect(debeRenovarBloqueo(null, objetivo)).toBe(true);
    expect(debeRenovarBloqueo(objetivo, objetivo)).toBe(false);
    // Un bloqueo del semestre anterior se queda corto: se renueva.
    expect(debeRenovarBloqueo(new Date('2026-07-01T04:59:59.999Z'), objetivo)).toBe(true);
  });

  it('un bloqueo más largo que el semestre no se acorta', () => {
    expect(debeRenovarBloqueo(new Date('2027-01-30T00:00:00.000Z'), objetivo)).toBe(false);
  });
});

describe('fecha que escribe la administración', () => {
  it('solo días reales', () => {
    expect(esFinDePeriodoValido('2026-12-17')).toBe(true);
    expect(esFinDePeriodoValido('2026-13-01')).toBe(false);
    expect(esFinDePeriodoValido('17/12/2026')).toBe(false);
    expect(esFinDePeriodoValido(null)).toBe(false);
  });
});
