import { describe, expect, it } from 'vitest';
import {
  COLUMNAS_ATTENDANCE,
  COLUMNAS_CONSOLIDADO,
  COLUMNAS_GRADES,
  construirFilas,
  construirFilasTexto,
  type MapBundle,
} from '../src/modules/reports/report-columns.js';
import { anchoUtil, orientacionPara } from '../src/modules/reports/report-layout.js';
import type { AcademicRecord } from '../src/shared/academic.service.js';

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
    expect(fila).toEqual(['1005123', 'Ana Pérez', 'A1', 'INF101 Programación', '2026-03-10', '120', 'Sí', 'Llegó tarde', '2026-1']);
  });

  it('referencias desconocidas producen celdas vacías, no un error', () => {
    const [fila] = construirFilasTexto(COLUMNAS_ATTENDANCE, [{ ...asistencia, studentId: 'nadie', groupId: null }], maps);
    expect(fila[0]).toBe('');
    expect(fila[1]).toBe('');
    expect(fila[2]).toBe('');
  });
});

describe('columnas de notas', () => {
  const componente = COLUMNAS_GRADES.findIndex(c => c.key === 'component');

  it('componente con corte se etiqueta «C<corte> · <tipo> · <etiqueta>»', () => {
    const nota = { studentId: 's1', subjectId: 'm1', groupId: 'g1', corte: 2, componentType: 'PARCIALES', label: 'Parcial teórico', score: 3.5, period: '2026-1' };
    const [fila] = construirFilasTexto(COLUMNAS_GRADES, [nota], maps);
    expect(fila[componente]).toBe('C2 · Parciales · Parcial teórico');
  });

  it('la etiqueta por defecto («Nota») no se repite en el acta', () => {
    const nota = { studentId: 's1', subjectId: 'm1', corte: 3, componentType: 'AUTOEVALUACION', label: 'Nota', score: 4, period: '2026-1' };
    const [fila] = construirFilasTexto(COLUMNAS_GRADES, [nota], maps);
    expect(fila[componente]).toBe('C3 · Autoevaluación');
  });

  it('en texto la nota sale con dos decimales fijos, para que la columna se lea alineada', () => {
    const nota = { studentId: 's1', subjectId: 'm1', corte: 1, componentType: 'TRABAJOS', score: 3.5, period: '2026-1' };
    const [fila] = construirFilasTexto(COLUMNAS_GRADES, [nota], maps);
    expect(fila[COLUMNAS_GRADES.findIndex(c => c.key === 'score')]).toBe('3.50');
  });

  it('una nota por debajo de la de aprobación se marca; una aprobatoria no', () => {
    const score = COLUMNAS_GRADES.find(c => c.key === 'score')!;
    expect(score.tono?.('2.99')).toBe('mal');
    expect(score.tono?.('3.00')).toBeNull();
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
    expect(fila).toEqual(['1005123', 'Ana Pérez', 'Programación', '3.2', '4.1', '0.0', '3.61', 'Aprobado', '88%', '2026-1']);
  });

  it('cada corte es una columna numérica: en Excel se puede sumar y ordenar', () => {
    const record = { code: '1', fullName: 'A', subjectId: 'm1', period: '2026-1', cortes: [3.25, 4, 0], notaFinal: 2.4, aprobado: false, riesgo: { porcentajeAsistencia: 50 } } as unknown as AcademicRecord;
    const [fila] = construirFilas(COLUMNAS_CONSOLIDADO, [record], maps);
    const keys = COLUMNAS_CONSOLIDADO.map(c => c.key);
    expect(fila[keys.indexOf('c1')]).toBe(3.25);
    expect(fila[keys.indexOf('c3')]).toBe(0);
  });

  it('el estado y la asistencia llevan su tono con los umbrales del dominio', () => {
    const estado = COLUMNAS_CONSOLIDADO.find(c => c.key === 'estado')!;
    const asistencia = COLUMNAS_CONSOLIDADO.find(c => c.key === 'attendance')!;
    expect(estado.tono?.('Aprobado')).toBe('ok');
    expect(estado.tono?.('Reprobado')).toBe('mal');
    expect(asistencia.tono?.('59%')).toBe('mal');
    expect(asistencia.tono?.('65%')).toBe('alerta');
    expect(asistencia.tono?.('70%')).toBeNull();
  });
});

describe('anchos del PDF', () => {
  // Los anchos del catálogo son los naturales: los que necesita el contenido
  // para no partirse. Forzarlos a la página vertical es lo que cortaba nombres
  // y cédulas; lo que no cabe ahí va en horizontal.
  it.each([
    ['attendance', COLUMNAS_ATTENDANCE],
    ['grades', COLUMNAS_GRADES],
    ['consolidado', COLUMNAS_CONSOLIDADO],
  ])('las columnas de %s caben en la página horizontal', (_nombre, columnas) => {
    const total = columnas.reduce((suma, c) => suma + c.pdfWidth, 0);
    expect(total).toBeLessThanOrEqual(anchoUtil('landscape'));
  });

  it('los catálogos completos van en horizontal', () => {
    expect(orientacionPara([COLUMNAS_ATTENDANCE.map(c => c.pdfWidth)])).toBe('landscape');
    expect(orientacionPara([COLUMNAS_CONSOLIDADO.map(c => c.pdfWidth)])).toBe('landscape');
  });

  it('una plantilla con pocas columnas vuelve a la vertical', () => {
    const pocas = COLUMNAS_CONSOLIDADO.filter(c => ['code', 'student', 'final', 'estado'].includes(c.key));
    expect(orientacionPara([pocas.map(c => c.pdfWidth)])).toBe('portrait');
  });
});
