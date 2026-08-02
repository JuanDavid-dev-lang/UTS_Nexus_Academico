import { describe, expect, it } from 'vitest';
import { parseRoster } from '@/domain/roster/parse-roster';

describe('parseRoster', () => {
  it('lee el formato que exporta Excel en español: punto y coma', () => {
    const { rows, errors } = parseRoster('1098765432;Pepito Pérez\n1098765433;Ana Gómez');

    expect(errors).toHaveLength(0);
    expect(rows).toEqual([
      { code: '1098765432', fullName: 'Pepito Pérez' },
      { code: '1098765433', fullName: 'Ana Gómez' },
    ]);
  });

  it('descarta la fila de cabecera en vez de importarla como estudiante', () => {
    const { rows } = parseRoster('Cédula;Nombre completo\n1098765432;Pepito Pérez');

    expect(rows).toHaveLength(1);
    expect(rows[0]?.code).toBe('1098765432');
  });

  it('acepta las columnas al revés: el número es la cédula, esté donde esté', () => {
    const { rows } = parseRoster('Pepito Pérez;1098765432');

    expect(rows[0]).toEqual({ code: '1098765432', fullName: 'Pepito Pérez' });
  });

  it('respeta las comillas de Excel cuando el nombre lleva coma', () => {
    const { rows } = parseRoster('1098765432,"Pérez Gómez, Pepito"');

    expect(rows[0]?.fullName).toBe('Pérez Gómez, Pepito');
  });

  it('quita el BOM para que la primera cédula no se corrompa', () => {
    const { rows, errors } = parseRoster('﻿1098765432;Pepito Pérez');

    expect(errors).toHaveLength(0);
    expect(rows[0]?.code).toBe('1098765432');
  });

  it('normaliza los separadores de miles que Excel mete en las cédulas', () => {
    const { rows } = parseRoster('1.098.765.432;Pepito Pérez');

    expect(rows[0]?.code).toBe('1098765432');
  });

  it('cuenta las cédulas repetidas en vez de matricularlas dos veces', () => {
    const { rows, duplicates } = parseRoster(
      '1098765432;Pepito Pérez\n1098765432;Pepito Perez\n1098765433;Ana Gómez',
    );

    expect(rows).toHaveLength(2);
    expect(duplicates).toBe(1);
  });

  it('reporta la línea exacta que no pudo leer, no la descarta en silencio', () => {
    const { rows, errors } = parseRoster('1098765432;Pepito Pérez\nsolo texto sin cedula');

    expect(rows).toHaveLength(1);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.line).toBe(2);
    expect(errors[0]?.raw).toBe('solo texto sin cedula');
  });

  it('aprovecha el correo si viene en una columna extra', () => {
    const { rows } = parseRoster('1098765432;Pepito Pérez;pepito@estudiantes.uts.edu.co');

    expect(rows[0]?.email).toBe('pepito@estudiantes.uts.edu.co');
  });

  it('acepta tabulaciones, que es lo que sale al copiar y pegar desde una hoja', () => {
    const { rows, errors } = parseRoster('1098765432\tPepito Pérez');

    expect(errors).toHaveLength(0);
    expect(rows[0]?.fullName).toBe('Pepito Pérez');
  });

  it('ignora las líneas en blanco del final del archivo', () => {
    const { rows, errors } = parseRoster('1098765432;Pepito Pérez\n\n\n');

    expect(rows).toHaveLength(1);
    expect(errors).toHaveLength(0);
  });

  it('devuelve vacío para un texto vacío, sin inventar errores', () => {
    expect(parseRoster('   \n  ')).toEqual({ rows: [], errors: [], duplicates: 0 });
  });
});
