import { describe, expect, it } from 'vitest';
import {
  cruzarNotasConMatricula,
  interpretarMatrizNotas,
  leerNota,
} from '../src/domains/grading/import-notas.js';

/**
 * La importación masiva escribe calificaciones reales. Estas pruebas fijan el
 * principio del módulo: nada se da por bueno en silencio — una nota fuera de
 * rango o una fila sin dueño claro se marca, no se adivina.
 */

const MATRICULADOS = [
  { id: 'a', code: '1005001', fullName: 'Ana María Pérez Gómez' },
  { id: 'b', code: '1005002', fullName: 'Bruno Díaz Castro' },
  { id: 'c', code: '1005003', fullName: 'Carla Ruiz Soto' },
];

describe('leerNota', () => {
  it('acepta punto y coma decimal', () => {
    expect(leerNota('3.5').valor).toBe(3.5);
    expect(leerNota('3,5').valor).toBe(3.5);
  });

  it('una nota fuera de rango se marca, no se recorta', () => {
    const resultado = leerNota('45');
    expect(resultado.valor).toBeNull();
    expect(resultado.aviso).toContain('fuera del rango');
  });

  it('texto no numérico no es nota ni error', () => {
    expect(leerNota('Pérez')).toEqual({ valor: null, aviso: null });
    expect(leerNota('')).toEqual({ valor: null, aviso: null });
  });
});

describe('interpretarMatrizNotas', () => {
  it('reconoce cédula, nombre y notas sin importar el orden de columnas', () => {
    const { filas, columnas } = interpretarMatrizNotas([
      ['Ana María Pérez', '1005001', '4,5', '3.0'],
      ['1005002', 'Bruno Díaz', '2.8', '4.1'],
    ]);
    expect(columnas).toBe(2);
    expect(filas[0]).toMatchObject({ cedula: '1005001', nombre: 'Ana María Pérez', notas: [4.5, 3] });
    expect(filas[1]).toMatchObject({ cedula: '1005002', nombre: 'Bruno Díaz', notas: [2.8, 4.1] });
  });

  it('descarta cabeceras y filas vacías', () => {
    const { filas } = interpretarMatrizNotas([
      ['Cédula', 'Nombre', 'Parcial'],
      ['', '', ''],
      ['1005001', 'Ana Pérez', '4.0'],
    ]);
    expect(filas).toHaveLength(1);
    expect(filas[0]?.cedula).toBe('1005001');
  });

  it('rellena filas cortas al ancho común con null', () => {
    const { filas, columnas } = interpretarMatrizNotas([
      ['1005001', 'Ana', '4.0', '3.0'],
      ['1005002', 'Bruno', '2.5'],
    ]);
    expect(columnas).toBe(2);
    expect(filas[1]?.notas).toEqual([2.5, null]);
  });

  it('una fila sin cédula pero con notas se conserva y se marca', () => {
    const { filas } = interpretarMatrizNotas([['Carla Ruiz', '3.9']]);
    expect(filas).toHaveLength(1);
    expect(filas[0]?.avisos.join(' ')).toContain('cédula');
  });
});

describe('cruzarNotasConMatricula', () => {
  it('cédula exacta asigna y conserva las notas', () => {
    const { filas } = cruzarNotasConMatricula(
      [{ indice: 0, cedula: '1005001', nombre: 'Ana Pérez', confianza: 1, notas: [4.5], avisos: [] }],
      MATRICULADOS,
    );
    expect(filas[0]).toMatchObject({ studentId: 'a', nivel: 'exacta', notas: [4.5] });
  });

  it('sin coincidencia queda sin asignar, nunca adivinado', () => {
    const { filas } = cruzarNotasConMatricula(
      [{ indice: 0, cedula: '9999999', nombre: 'Zutano Desconocido', confianza: 1, notas: [3], avisos: [] }],
      MATRICULADOS,
    );
    expect(filas[0]?.studentId).toBeNull();
    expect(filas[0]?.nivel).toBe('sin-coincidencia');
  });

  it('los matriculados sin fila se reportan, no se pierden', () => {
    const { sinFila } = cruzarNotasConMatricula(
      [{ indice: 0, cedula: '1005001', nombre: 'Ana', confianza: 1, notas: [4], avisos: [] }],
      MATRICULADOS,
    );
    expect(sinFila.map(m => m.id).sort()).toEqual(['b', 'c']);
  });

  it('los avisos propios de la fila sobreviven al cruce', () => {
    const { filas } = cruzarNotasConMatricula(
      [{ indice: 0, cedula: '1005001', nombre: 'Ana', confianza: 0.5, notas: [null], avisos: ['«45» está fuera del rango 0–5; revísala.'] }],
      MATRICULADOS,
    );
    expect(filas[0]?.avisos.join(' ')).toContain('fuera del rango');
  });
});
