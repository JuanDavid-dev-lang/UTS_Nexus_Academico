import { describe, expect, it } from 'vitest';
import { parseGrades, parseScore } from '@/domain/grades/parse-grades';

/**
 * El parser alimenta la importación masiva de calificaciones. Lo que fija:
 * nada se recorta ni desaparece en silencio — una nota fuera de rango se
 * marca y una fila rota explica por qué, línea por línea.
 */

describe('parseScore', () => {
  it('acepta punto y coma decimal', () => {
    expect(parseScore('3.5').value).toBe(3.5);
    expect(parseScore('3,5').value).toBe(3.5);
  });

  it('fuera de rango se marca, no se recorta', () => {
    const result = parseScore('45');
    expect(result.value).toBeNull();
    expect(result.warning).toContain('fuera del rango');
  });

  it('texto no numérico no es nota ni aviso', () => {
    expect(parseScore('Pérez')).toEqual({ value: null, warning: null });
  });
});

describe('parseGrades', () => {
  it('reconoce cédula, nombre y varias notas con ;', () => {
    const { rows, columns } = parseGrades('1005001;Ana Pérez;4,5;3.0\n1005002;Bruno Díaz;2.8;4.1');
    expect(columns).toBe(2);
    expect(rows[0]).toMatchObject({ code: '1005001', fullName: 'Ana Pérez', scores: [4.5, 3] });
    expect(rows[1]).toMatchObject({ code: '1005002', scores: [2.8, 4.1] });
  });

  it('no depende del orden de columnas', () => {
    const { rows } = parseGrades('Ana Pérez\t4.0\t1005001');
    expect(rows[0]).toMatchObject({ code: '1005001', fullName: 'Ana Pérez', scores: [4] });
  });

  it('salta la cabecera aunque diga «Nota 1»', () => {
    const { rows } = parseGrades('Cédula;Nombre;Nota 1\n1005001;Ana;4.0');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.code).toBe('1005001');
  });

  it('rellena filas cortas al ancho común', () => {
    const { rows, columns } = parseGrades('1005001;Ana;4.0;3.0\n1005002;Bruno;2.5');
    expect(columns).toBe(2);
    expect(rows[1]?.scores).toEqual([2.5, null]);
  });

  it('una fila sin cédula falla con motivo, no desaparece', () => {
    const { rows, errors } = parseGrades('Ana Pérez;4.0');
    expect(rows).toHaveLength(0);
    expect(errors[0]?.reason).toContain('cédula');
  });

  it('una nota fuera de rango queda null con su aviso', () => {
    const { rows } = parseGrades('1005001;Ana;45');
    expect(rows[0]?.scores).toEqual([null]);
    expect(rows[0]?.warnings.join(' ')).toContain('fuera del rango');
  });

  it('cédulas repetidas se cuentan como duplicados', () => {
    const { rows, duplicates } = parseGrades('1005001;Ana;4.0\n1005001;Ana;4.0');
    expect(rows).toHaveLength(1);
    expect(duplicates).toBe(1);
  });

  it('texto vacío devuelve resultado vacío sin error', () => {
    expect(parseGrades('')).toEqual({ rows: [], errors: [], columns: 0, duplicates: 0 });
  });
});
