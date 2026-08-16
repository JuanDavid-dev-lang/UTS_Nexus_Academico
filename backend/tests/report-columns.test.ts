import { describe, expect, it } from 'vitest';
import {
  COLUMNAS_ATTENDANCE,
  COLUMNAS_CONSOLIDADO,
  COLUMNAS_GRADES,
  construirFilas,
  construirFilasTexto,
  type MapBundle,
} from '../src/modules/reports/report-columns.js';

/**
 * El catálogo de columnas es la única fuente de filas para PDF, Excel y vista
 * previa. Estas pruebas fijan el contrato: si una columna cambia de orden, de
 * encabezado o de fórmula, tiene que ser a propósito — porque el mismo cambio
 * aparece a la vez en el acta descargada y en la vista previa.
 */

const maps: MapBundle = {
  students: new Map([['s1', { code: '1005123', fullName: 'Ana Pérez' }]]),
  subjects: new Map([['m1', { code: 'INF101', name: 'Programación' }]]),
  groups: new Map([['g1', { name: 'A1' }]]),
};

const asistencia = {
  studentId: 's1',
  subjectId: 'm1',
  groupId: 'g1',
  date: new Date('2026-03-10T12:00:00Z'),
  durationMinutes: 120,
  present: true,
  notes: 'Llegó tarde',
  period: '2026-1',
};

describe('columnas de asistencia', () => {
  it('incluye los minutos de la clase (la asistencia se pondera por minutos)', () => {
    const headers = COLUMNAS_ATTENDANCE.map(c => c.header);
    expect(headers).toContain('Min.');
    const [fila] = construirFilas(COLUMNAS_ATTENDANCE, [asistencia], maps);
    expect(fila[headers.indexOf('Min.')]).toBe(120);
  });

  it('sin durationMinutes cae al valor por defecto del modelo (90)', () => {
    const [fila] = construirFilas(COLUMNAS_ATTENDANCE, [{ ...asistencia, durationMinutes: undefined }], maps);
    expect(fila[COLUMNAS_ATTENDANCE.findIndex(c => c.key === 'minutes')]).toBe(90);
  });

  it('resuelve estudiante, materia y grupo desde los mapas', () => {
    const [fila] = construirFilasTexto(COLUMNAS_ATTENDANCE, [asistencia], maps);
    expect(fila).toEqual(['1005123', 'Ana Pérez', 'A1', 'INF101 Programación', '2026-03-10', '120', 'Si', 'Llegó tarde', '2026-1']);
  });

  it('referencias desconocidas producen celdas vacías, no un error', () => {
    const [fila] = construirFilasTexto(COLUMNAS_ATTENDANCE, [{ ...asistencia, studentId: 'nadie', groupId: null }], maps);
    expect(fila[0]).toBe('');
    expect(fila[1]).toBe('');
    expect(fila[2]).toBe('');
  });
});

describe('columnas de notas', () => {
  it('componente con corte se etiqueta C<corte> <tipo>', () => {
    const nota = { studentId: 's1', subjectId: 'm1', groupId: 'g1', corte: 2, componentType: 'PARCIALES', score: 3.5, period: '2026-1' };
    const [fila] = construirFilasTexto(COLUMNAS_GRADES, [nota], maps);
    expect(fila[COLUMNAS_GRADES.findIndex(c => c.key === 'component')]).toBe('C2 PARCIALES');
  });

  it('la nota viaja como número (Excel la quiere tipada)', () => {
    const nota = { studentId: 's1', subjectId: 'm1', corte: 1, componentType: 'TRABAJOS', score: 4.25, period: '2026-1' };
    const [fila] = construirFilas(COLUMNAS_GRADES, [nota], maps);
    expect(fila[COLUMNAS_GRADES.findIndex(c => c.key === 'score')]).toBe(4.25);
  });
});

describe('columnas del consolidado', () => {
  it('cortes, final, estado y asistencia salen del registro académico', () => {
    const record: any = {
      code: '1005123',
      fullName: 'Ana Pérez',
      subjectId: 'm1',
      period: '2026-1',
      cortes: [3.2, 4.1, 0],
      notaFinal: 3.61,
      aprobado: true,
      riesgo: { porcentajeAsistencia: 87.5 },
    };
    const [fila] = construirFilasTexto(COLUMNAS_CONSOLIDADO, [record], maps);
    expect(fila).toEqual(['1005123', 'Ana Pérez', 'Programación', 'C1:3.2 C2:4.1 C3:0.0', '3.61', 'Aprobado', '88%', '2026-1']);
  });
});

describe('anchos del PDF', () => {
  it.each([
    ['attendance', COLUMNAS_ATTENDANCE],
    ['grades', COLUMNAS_GRADES],
    ['consolidado', COLUMNAS_CONSOLIDADO],
  ])('las columnas de %s caben en la página A4 (530pt útiles)', (_nombre, columnas) => {
    const total = columnas.reduce((suma, c) => suma + c.pdfWidth, 0);
    expect(total).toBeLessThanOrEqual(530);
  });
});
