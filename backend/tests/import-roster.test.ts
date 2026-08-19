import { describe, expect, it } from 'vitest';
import { interpretarMatrizListado } from '../src/domains/enrollment/import-roster.js';

describe('interpretarMatrizListado', () => {
  it('mapea cabeceras institucionales equivalentes', () => {
    const resultado = interpretarMatrizListado([
      ['ID estudiante', 'Nombre completo', 'Email', 'Carrera'],
      ['1098765432', 'Ana Pérez Gómez', 'ana@uts.edu.co', 'Sistemas'],
    ]);
    expect(resultado.filas[0]).toMatchObject({
      cedula: '1098765432',
      nombre: 'Ana Pérez Gómez',
      correo: 'ana@uts.edu.co',
      programa: 'Sistemas',
      confianza: 1,
    });
  });

  it('infiere columnas sin cabecera y conserva advertencias', () => {
    const resultado = interpretarMatrizListado([
      ['Pepito Pérez', '1.098.765.432'],
      ['Sin código', 'dato'],
    ]);
    expect(resultado.filas[0]).toMatchObject({ cedula: '1098765432', nombre: 'Pepito Pérez' });
    expect(resultado.filas[1]?.avisos).toContain('Código o documento inválido.');
  });

  it('marca duplicados y archivos vacíos', () => {
    const repetidos = interpretarMatrizListado([
      ['Código', 'Estudiante'],
      ['12345', 'Uno Válido'],
      ['12345', 'Otro Nombre'],
    ]);
    expect(repetidos.filas[1]?.avisos).toContain('Código repetido en el archivo.');
    expect(interpretarMatrizListado([]).avisos).toContain('El archivo está vacío.');
  });
});
