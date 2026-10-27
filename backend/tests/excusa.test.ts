import { describe, expect, it } from 'vitest';
import { motivoParaNoJustificar } from '../src/domains/attendance/excusa.js';

/**
 * Qué se puede justificar. Una excusa guardada sobre un registro que no es una
 * falta no da error: se queda escondida hasta que alguien marque la falta y se
 * encuentre una justificación que nunca puso.
 */
describe('motivoParaNoJustificar', () => {
  it('una falta con motivo se justifica', () => {
    expect(motivoParaNoJustificar({ present: false }, { motivo: 'MEDICA', detalle: '' })).toBeNull();
  });

  it('un registro presente no se justifica', () => {
    expect(motivoParaNoJustificar({ present: true }, { motivo: 'MEDICA', detalle: '' })).toMatch(/presente/);
  });

  it('«Otra» exige describir la excusa', () => {
    expect(motivoParaNoJustificar({ present: false }, { motivo: 'OTRA', detalle: '  ' })).toMatch(/describe/);
    expect(motivoParaNoJustificar({ present: false }, { motivo: 'OTRA', detalle: 'Cita en la Registraduría' })).toBeNull();
  });
});
