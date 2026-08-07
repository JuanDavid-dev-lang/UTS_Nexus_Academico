import { describe, expect, it } from 'vitest';
import { evaluarRiesgo } from '../src/domains/risk/risk.service.js';
import type { NotaComponente } from '../src/domains/grading/grading.service.js';
import type { RegistroAsistencia } from '../src/domains/attendance/attendance.service.js';

/**
 * El riesgo decide a quién persigue el docente. Un falso positivo le hace
 * perder la tarde; un falso negativo le hace perder al estudiante. Lo que estas
 * pruebas fijan es sobre todo cuándo NO debe alarmar.
 */

const corte = (valor: number, numero: 1 | 2 | 3 = 1): NotaComponente[] => [
  { corte: numero, tipo: 'TRABAJOS', score: valor },
  { corte: numero, tipo: 'PARCIALES', score: valor },
  { corte: numero, tipo: 'AUTOEVALUACION', score: valor },
];

const clases = (presentes: number, ausentes: number): RegistroAsistencia[] => [
  ...Array.from({ length: presentes }, () => ({ present: true, durationMinutes: 90 })),
  ...Array.from({ length: ausentes }, () => ({ present: false, durationMinutes: 90 })),
];

describe('evaluarRiesgo', () => {
  it('quien va bien y asiste no está en riesgo', () => {
    const resultado = evaluarRiesgo({ notas: corte(4.5), asistencia: clases(10, 0) });

    expect(resultado.nivel).toBe('BAJO');
    expect(resultado.motivos).toHaveLength(0);
    expect(resultado.sinNotas).toBe(false);
  });

  it('no marca bajo rendimiento a quien todavía no tiene ninguna nota', () => {
    const resultado = evaluarRiesgo({ notas: [], asistencia: clases(10, 0) });

    expect(resultado.sinNotas).toBe(true);
    expect(resultado.nivel).toBe('BAJO');
    expect(resultado.motivos.join(' ')).not.toContain('Bajo rendimiento');
  });

  it('sin notas el riesgo lo decide solo la asistencia', () => {
    const resultado = evaluarRiesgo({ notas: [], asistencia: clases(4, 6) });

    expect(resultado.sinNotas).toBe(true);
    expect(resultado.nivel).toBe('ALTO');
    expect(resultado.motivos.join(' ')).toContain('Faltas acumuladas');
  });

  it('usa el promedio parcial: un solo corte bueno no se lee como final baja', () => {
    // Con la nota final este estudiante tendría 1.49 y saldría en riesgo alto.
    const resultado = evaluarRiesgo({ notas: corte(4.5), asistencia: clases(10, 0) });

    expect(resultado.notaActual).toBe(4.5);
    expect(resultado.nivel).toBe('BAJO');
  });

  it('el promedio por debajo del mínimo levanta el motivo de rendimiento', () => {
    const resultado = evaluarRiesgo({ notas: corte(2.5), asistencia: clases(10, 0) });

    expect(resultado.motivos.join(' ')).toContain('Bajo rendimiento');
    expect(resultado.nivel).not.toBe('BAJO');
  });

  it('más de un punto por debajo del mínimo es riesgo alto', () => {
    const resultado = evaluarRiesgo({ notas: corte(1.5), asistencia: clases(10, 0) });
    expect(resultado.nivel).toBe('ALTO');
  });

  it('la asistencia bajo el umbral crítico es riesgo alto aunque las notas vayan bien', () => {
    const resultado = evaluarRiesgo({ notas: corte(5), asistencia: clases(5, 5) });

    expect(resultado.porcentajeAsistencia).toBe(50);
    expect(resultado.nivel).toBe('ALTO');
  });

  it('acumular tres ausencias ya se dice, aunque el porcentaje aguante', () => {
    const resultado = evaluarRiesgo({ notas: corte(5), asistencia: clases(30, 3) });

    expect(resultado.clasesAusente).toBe(3);
    expect(resultado.motivos.join(' ')).toContain('3 clases perdidas');
  });

  it('el puntaje nunca se sale de 0–100', () => {
    const pesimo = evaluarRiesgo({ notas: corte(0), asistencia: clases(0, 40) });
    const perfecto = evaluarRiesgo({ notas: corte(5), asistencia: clases(40, 0) });

    expect(pesimo.puntaje).toBeLessThanOrEqual(100);
    expect(pesimo.puntaje).toBeGreaterThanOrEqual(0);
    expect(perfecto.puntaje).toBe(0);
  });

  it('peor desempeño nunca produce menos puntaje que uno mejor', () => {
    const mejor = evaluarRiesgo({ notas: corte(4), asistencia: clases(10, 1) });
    const peor = evaluarRiesgo({ notas: corte(2), asistencia: clases(5, 6) });

    expect(peor.puntaje).toBeGreaterThan(mejor.puntaje);
  });

  it('un estudiante sin notas y sin clases registradas no dispara alarmas', () => {
    const resultado = evaluarRiesgo({ notas: [], asistencia: [] });

    expect(resultado.nivel).toBe('BAJO');
    expect(resultado.puntaje).toBe(0);
    expect(resultado.motivos).toHaveLength(0);
  });
});
