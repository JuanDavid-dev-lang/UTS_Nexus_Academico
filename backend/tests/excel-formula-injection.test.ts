import { describe, expect, it } from 'vitest';
import { celdaSegura } from '../src/modules/reports/excel.renderer.js';

/**
 * Los exportables llevan texto que escribe gente: el nombre de un estudiante
 * llega por importación de listado o por OCR de una foto, y la observación de
 * una asistencia son 500 caracteres libres del docente.
 *
 * Excel y LibreOffice ejecutan cualquier celda que empiece por `=`, `+`, `-`,
 * `@`, tabulador o retorno de carro. Quien abre el acta es coordinación o
 * secretaría, así que el que ejecuta no es el que escribió.
 *
 * Estas pruebas fijan las dos mitades: que lo peligroso se neutraliza y que lo
 * normal **no** se toca — un escape demasiado ansioso que le ponga un apóstrofo
 * a cada celda ensucia todas las actas de la institución.
 */
describe('escape de fórmulas en los exportables', () => {
  it.each([
    ['=1+1', "'=1+1"],
    ['=HYPERLINK("http://x","clic")', '\'=HYPERLINK("http://x","clic")'],
    ["=cmd|'/c calc'!A0", "'=cmd|'/c calc'!A0"],
    ['+41234567', "'+41234567"],
    ['-2+3', "'-2+3"],
    ['@SUM(A1:A9)', "'@SUM(A1:A9)"],
    ['\tcon tabulador', "'\tcon tabulador"],
    ['\rcon retorno', "'\rcon retorno"],
  ])('neutraliza %j', (entrada, esperado) => {
    expect(celdaSegura(entrada)).toBe(esperado);
  });

  it.each([
    'Ana María Pérez',
    'Cálculo Diferencial',
    'Llegó 10 min tarde',
    'A-102', // un aula: el guion no va al principio
    '3.5',
    '',
  ])('deja intacto el texto normal: %j', valor => {
    expect(celdaSegura(valor)).toBe(valor);
  });

  it('no toca los números ni los booleanos', () => {
    // Un `-2` numérico es una nota o un conteo, no una fórmula: convertirlo a
    // texto rompería las sumas de la hoja.
    expect(celdaSegura(-2)).toBe(-2);
    expect(celdaSegura(4.5)).toBe(4.5);
    expect(celdaSegura(true)).toBe(true);
    expect(celdaSegura(null)).toBe(null);
  });
});
