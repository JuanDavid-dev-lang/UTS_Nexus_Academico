import { describe, expect, it } from 'vitest';
import {
  PLANTILLA_POR_DEFECTO,
  VERDE_UTS,
  hexAArgb,
  plantillaSchema,
  resolverColumnas,
} from '../src/modules/reports/report-template.js';
import { CATALOGOS } from '../src/modules/reports/report-columns.js';

/**
 * La plantilla decide cómo se ven las actas que el docente entrega. Estas
 * pruebas fijan las salvaguardas: una configuración rota degrada a los valores
 * por defecto, nunca a un acta sin columnas o sin cédula.
 */

describe('plantillaSchema', () => {
  it('sin nada guardado produce los valores actuales de los reportes', () => {
    expect(PLANTILLA_POR_DEFECTO.institucion).toBe('Unidades Tecnológicas de Santander');
    expect(PLANTILLA_POR_DEFECTO.sigla).toBe('UTS');
    expect(PLANTILLA_POR_DEFECTO.colores).toEqual({
      marca: VERDE_UTS,
      encabezadoTabla: VERDE_UTS,
      encabezadoExcel: VERDE_UTS,
    });
    expect(PLANTILLA_POR_DEFECTO.logoUrl).toBeNull();
  });

  it('los colores por defecto de la primera plantilla se leen como «sin elegir» y pasan al verde UTS', () => {
    // El editor guarda la plantilla entera: quien la guardó sin tocar los
    // colores tiene estos tres escritos en la base.
    const guardada = plantillaSchema.parse({
      colores: { marca: '#74D3B2', encabezadoTabla: '#d7f0e5', encabezadoExcel: '#17313b' },
    });
    expect(guardada.colores).toEqual({ marca: VERDE_UTS, encabezadoTabla: VERDE_UTS, encabezadoExcel: VERDE_UTS });
  });

  it('un color elegido de verdad se respeta', () => {
    const guardada = plantillaSchema.parse({ colores: { marca: '#7a1f2b' } });
    expect(guardada.colores.marca).toBe('#7a1f2b');
    expect(guardada.colores.encabezadoTabla).toBe(VERDE_UTS);
  });

  it('rechaza colores fuera de #RRGGBB', () => {
    expect(() => plantillaSchema.parse({ colores: { marca: 'rojo' } })).toThrow();
    expect(() => plantillaSchema.parse({ colores: { marca: '#123' } })).toThrow();
  });

  it('rechaza un logo que no sea una ruta subida a /uploads', () => {
    expect(() => plantillaSchema.parse({ logoUrl: 'https://evil.example/logo.png' })).toThrow();
    expect(plantillaSchema.parse({ logoUrl: '/uploads/logo.png' }).logoUrl).toBe('/uploads/logo.png');
  });
});

describe('resolverColumnas', () => {
  it('sin selección devuelve el catálogo completo', () => {
    expect(resolverColumnas(PLANTILLA_POR_DEFECTO, 'attendance')).toEqual(CATALOGOS.attendance);
  });

  it('con selección devuelve solo esas columnas, en el orden del catálogo', () => {
    const plantilla = plantillaSchema.parse({
      columnas: { attendance: ['present', 'code', 'student'] },
    });
    const keys = resolverColumnas(plantilla, 'attendance').map(c => c.key);
    expect(keys).toEqual(['code', 'student', 'present']);
  });

  it('una selección sin la cédula cae al catálogo completo', () => {
    const plantilla = plantillaSchema.parse({ columnas: { attendance: ['student', 'date'] } });
    expect(resolverColumnas(plantilla, 'attendance')).toEqual(CATALOGOS.attendance);
  });

  it('una plantilla guardada con la columna «cortes» recibe las tres columnas de corte', () => {
    const plantilla = plantillaSchema.parse({ columnas: { consolidado: ['code', 'student', 'cortes', 'final'] } });
    const keys = resolverColumnas(plantilla, 'consolidado').map(c => c.key);
    expect(keys).toEqual(['code', 'student', 'c1', 'c2', 'c3', 'final']);
  });

  it('una selección con claves inexistentes cae al catálogo completo', () => {
    const plantilla = plantillaSchema.parse({ columnas: { grades: ['no-existe'] } });
    expect(resolverColumnas(plantilla, 'grades')).toEqual(CATALOGOS.grades);
  });
});

describe('hexAArgb', () => {
  it('convierte #rrggbb al ARGB de ExcelJS', () => {
    expect(hexAArgb('#17313b')).toBe('FF17313B');
  });
});
