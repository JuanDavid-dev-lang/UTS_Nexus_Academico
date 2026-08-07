import { describe, expect, it } from 'vitest';
import {
  ASISTENCIA,
  calcularAsistencia,
  type RegistroAsistencia,
} from '../src/domains/attendance/attendance.service.js';

/**
 * La regla que define este dominio: la asistencia se pondera por MINUTOS, no
 * por número de clases. Faltar a una clase de tres horas no cuesta lo mismo que
 * faltar a una de hora y media, y contar clases lo trataría igual.
 */

const clase = (present: boolean, durationMinutes?: number | null): RegistroAsistencia => ({
  present,
  ...(durationMinutes === undefined ? {} : { durationMinutes }),
});

describe('calcularAsistencia', () => {
  it('pondera por minutos, no por cantidad de clases', () => {
    // Dos clases, una presente. Por conteo sería 50%; por minutos no.
    const resumen = calcularAsistencia([clase(true, 90), clase(false, 180)]);

    expect(resumen.totalClases).toBe(2);
    expect(resumen.clasesPresente).toBe(1);
    expect(resumen.minutosTotales).toBe(270);
    expect(resumen.minutosPresente).toBe(90);
    expect(resumen.porcentaje).toBeCloseTo(33.33, 2);
  });

  it('faltar a la clase larga penaliza más que faltar a la corta', () => {
    const faltaLarga = calcularAsistencia([clase(true, 90), clase(false, 180)]);
    const faltaCorta = calcularAsistencia([clase(false, 90), clase(true, 180)]);

    expect(faltaLarga.porcentaje).toBeLessThan(faltaCorta.porcentaje);
  });

  it('usa la duración por defecto cuando el registro no la trae', () => {
    const resumen = calcularAsistencia([clase(true), clase(false)]);
    expect(resumen.minutosTotales).toBe(ASISTENCIA.DURACION_DEFECTO * 2);
    expect(resumen.porcentaje).toBe(50);
  });

  it('trata una duración inválida como la de por defecto en vez de romper el porcentaje', () => {
    for (const invalida of [0, -30, Number.NaN]) {
      const resumen = calcularAsistencia([clase(true, invalida)]);
      expect(resumen.minutosTotales).toBe(ASISTENCIA.DURACION_DEFECTO);
      expect(resumen.porcentaje).toBe(100);
    }
  });

  it('una duración nula también cae en la de por defecto', () => {
    const resumen = calcularAsistencia([clase(true, null)]);
    expect(resumen.minutosTotales).toBe(ASISTENCIA.DURACION_DEFECTO);
  });

  it('sin clases registradas da 100%, no 0%: nadie faltó a nada', () => {
    const resumen = calcularAsistencia([]);
    expect(resumen.porcentaje).toBe(100);
    expect(resumen.totalClases).toBe(0);
  });

  it('asistencia perfecta y ausencia total son los dos extremos exactos', () => {
    expect(calcularAsistencia([clase(true, 90), clase(true, 180)]).porcentaje).toBe(100);
    expect(calcularAsistencia([clase(false, 90), clase(false, 180)]).porcentaje).toBe(0);
  });

  it('los minutos ausentes son el complemento de los presentes', () => {
    const resumen = calcularAsistencia([clase(true, 90), clase(false, 180), clase(true, 45)]);
    expect(resumen.minutosPresente + resumen.minutosAusente).toBe(resumen.minutosTotales);
    expect(resumen.clasesPresente + resumen.clasesAusente).toBe(resumen.totalClases);
  });

  it('el umbral crítico está por debajo del mínimo aceptable', () => {
    expect(ASISTENCIA.UMBRAL_CRITICO).toBeLessThan(ASISTENCIA.UMBRAL_MINIMO);
  });
});
