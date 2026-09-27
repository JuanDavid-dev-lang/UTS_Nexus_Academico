import { describe, expect, it } from 'vitest';
import type { MapBundle } from '../src/modules/reports/report-columns.js';
import type { AcademicRecord } from '../src/shared/academic.service.js';
import {
  detallesDelReporte,
  indicadorDeAsistencia,
  indicadoresAsistencia,
  indicadoresConsolidado,
  indicadoresNotas,
} from '../src/modules/reports/report-summary.js';

/**
 * La ficha y los indicadores que encabezan cada acta. Lo que fijan estas
 * pruebas: que el acta nombra materias y grupos en vez de imprimir ids, que no
 * nombra lo que no sale en sus filas, y que las cifras son las del dominio.
 */

const maps: MapBundle = {
  students: new Map([['s1', { code: '1005123', fullName: 'ANA PEREZ' }]]),
  subjects: new Map([['m1', { code: 'PIS701', name: 'Ingeniería del Software' }]]),
  groups: new Map([['g1', { name: 'A194' }]]),
};

const valor = (datos: { etiqueta: string; valor: string }[], etiqueta: string) =>
  datos.find(d => d.etiqueta === etiqueta)?.valor;

describe('detallesDelReporte', () => {
  it('nombra materia, grupo y estudiante con los diccionarios del reporte', () => {
    const datos = detallesDelReporte({ period: '2026-2', subjectId: 'm1', groupId: 'g1', studentId: 's1' }, maps, 'hoy');
    expect(valor(datos, 'Periodo')).toBe('2026-2');
    expect(valor(datos, 'Materia')).toBe('PIS701 · Ingeniería del Software');
    expect(valor(datos, 'Grupo')).toBe('A194');
    expect(valor(datos, 'Estudiante')).toBe('ANA PEREZ · 1005123');
    expect(valor(datos, 'Generado')).toBe('hoy');
  });

  it('un id que no sale en las filas no se imprime ni se resuelve', () => {
    const datos = detallesDelReporte({ subjectId: '66f1c0ffee', groupId: 'otro' }, maps, 'hoy');
    expect(datos.map(d => d.etiqueta)).toEqual(['Periodo', 'Generado']);
    expect(JSON.stringify(datos)).not.toContain('66f1c0ffee');
  });

  it('sin periodo dice «Todos» y el rango de fechas sale en dd/mm/aaaa', () => {
    const datos = detallesDelReporte({ dateFrom: new Date('2026-09-01'), dateTo: null }, maps, 'hoy');
    expect(valor(datos, 'Periodo')).toBe('Todos');
    expect(valor(datos, 'Rango de fechas')).toBe('01/09/2026 – Hoy');
  });
});

describe('indicadores', () => {
  it('el consolidado cuenta aprobados y reprobados con el estado que ya trae cada registro', () => {
    const registro = (studentId: string, notaFinal: number, aprobado: boolean) =>
      ({ studentId, notaFinal, aprobado }) as unknown as AcademicRecord;
    const indicadores = indicadoresConsolidado([registro('a', 4, true), registro('b', 2, false), registro('a', 3.5, true)]);
    expect(valor(indicadores, 'Estudiantes')).toBe('2');
    expect(valor(indicadores, 'Aprobados')).toBe('2');
    expect(valor(indicadores, 'Reprobados')).toBe('1');
    expect(valor(indicadores, 'Promedio final')).toBe('3.17');
  });

  it('las notas atómicas no llevan promedio: con pesos 30/60/10 no sería la nota de nadie', () => {
    const indicadores = indicadoresNotas([{ studentId: 'a', score: 2.5 }, { studentId: 'a', score: 4 }]);
    expect(indicadores.map(i => i.etiqueta)).not.toContain('Promedio final');
    expect(valor(indicadores, 'Por debajo de 3.0')).toBe('1');
  });

  it('la asistencia se pondera por minutos, como en el dominio', () => {
    // Una clase de 180 min ausente pesa el doble que una de 90 presente: 33.3 %, no 50 %.
    const registros = [
      { studentId: 'a', present: true, durationMinutes: 90 },
      { studentId: 'a', present: false, durationMinutes: 180 },
    ];
    expect(indicadorDeAsistencia(registros)).toEqual({ etiqueta: 'Asistencia (por minutos)', valor: '33.3%', tono: 'mal' });
    expect(valor(indicadoresAsistencia(registros), 'Ausencias')).toBe('1');
  });

  it('sin registros no hay indicadores (un acta vacía no dice «100 %»)', () => {
    expect(indicadoresConsolidado([])).toEqual([]);
    expect(indicadoresNotas([])).toEqual([]);
    expect(indicadoresAsistencia([])).toEqual([]);
    expect(indicadorDeAsistencia([])).toBeNull();
  });
});
