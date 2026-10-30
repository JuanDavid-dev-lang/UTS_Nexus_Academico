/**
 * Planilla de calificaciones.
 *
 * Fija que la planilla lleve a todo el grupo —también a quien no tiene notas—
 * y que «sin calificar» no se confunda con un cero.
 */
import { describe, expect, it } from 'vitest';
import {
  celdaComponente,
  celdaCorte,
  filasDePlanilla,
  pesosDeComponentes,
} from '@/domain/grades/planilla';
import type { ConsolidatedRow } from '@/domain/schemas/grades';

function fila(studentId: string, fullName: string, extra: Partial<ConsolidatedRow> = {}): ConsolidatedRow {
  return {
    studentId,
    code: `c-${studentId}`,
    fullName,
    notaFinal: 3.5,
    aprobado: true,
    completo: false,
    cortes: [],
    ...extra,
  };
}

const CON_CORTE = fila('a', 'BETA', {
  cortes: [
    {
      corte: 1,
      peso: 0.33,
      nota: 3.8,
      aporteFinal: 1.25,
      completo: false,
      componentes: [
        { tipo: 'TRABAJOS', peso: 0.3, promedio: 4, registros: 2, aporte: 1.2, notas: [] },
        { tipo: 'PARCIALES', peso: 0.6, promedio: 0, registros: 0, aporte: 0, notas: [] },
        { tipo: 'AUTOEVALUACION', peso: 0.1, promedio: 5, registros: 1, aporte: 0.5, notas: [] },
      ],
    },
  ],
});

describe('filasDePlanilla', () => {
  it('suma a los matriculados sin notas y ordena por nombre', () => {
    const filas = filasDePlanilla(
      [CON_CORTE],
      [
        { _id: 'a', code: 'c-a', fullName: 'BETA' },
        { _id: 'b', code: 'c-b', fullName: 'ÁLVAREZ' },
      ],
    );
    expect(filas.map((item) => item.studentId)).toEqual(['b', 'a']);
    expect(filas[0]?.row).toBeNull();
    expect(filas[1]?.row).toBe(CON_CORTE);
  });

  it('no duplica a quien está en el consolidado y en la matrícula', () => {
    expect(filasDePlanilla([CON_CORTE], [{ _id: 'a', code: 'c-a', fullName: 'BETA' }])).toHaveLength(1);
  });
});

describe('celdas', () => {
  it('lee la nota del corte tal como la entregó el servidor', () => {
    expect(celdaCorte(CON_CORTE, 1)).toEqual({ nota: 3.8, completo: false });
    expect(celdaCorte(CON_CORTE, 2)).toBeNull();
    expect(celdaCorte(null, 1)).toBeNull();
  });

  it('un componente sin registros es «sin calificar», no un cero', () => {
    expect(celdaComponente(CON_CORTE, 1, 'TRABAJOS')).toEqual({ promedio: 4, registros: 2 });
    expect(celdaComponente(CON_CORTE, 1, 'PARCIALES')).toBeNull();
    expect(celdaComponente(CON_CORTE, 3, 'TRABAJOS')).toBeNull();
  });
});

describe('pesosDeComponentes', () => {
  it('rotula con los pesos que informa el servidor', () => {
    expect(pesosDeComponentes([CON_CORTE])).toEqual({ TRABAJOS: 0.3, PARCIALES: 0.6, AUTOEVALUACION: 0.1 });
  });

  it('sin datos no inventa porcentajes', () => {
    expect(pesosDeComponentes([fila('x', 'X')])).toEqual({});
  });
});
