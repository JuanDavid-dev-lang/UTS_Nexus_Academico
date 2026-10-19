import { describe, expect, it } from 'vitest';
import { escaneoNotasSchema } from '@/domain/schemas/grades';

/**
 * La propuesta de `POST /grades/import/scan`.
 *
 * `columnasDetalle` llega con el reporte de Academusoft y decide si el diálogo
 * pide corte y componente o los toma de cada columna. Un servidor anterior no
 * lo manda: tiene que leerse como «no lo dice», no tumbar la importación.
 */
const BASE = {
  ok: true,
  origen: 'excel',
  groupId: '65f0000000000000000000aa',
  subjectId: '65f0000000000000000000bb',
  period: '2026-2',
  columnas: 1,
  avisos: [],
  filas: [],
  sinFila: [],
};

describe('escaneoNotasSchema', () => {
  it('un servidor sin el campo deja corte y componente a elección del docente', () => {
    const parsed = escaneoNotasSchema.parse(BASE);
    expect(parsed.columnasDetalle).toBeNull();
    expect(parsed.encabezado).toBeNull();
  });

  it('lee el corte y el componente de cada columna del reporte de Academusoft', () => {
    const parsed = escaneoNotasSchema.parse({
      ...BASE,
      origen: 'academusoft',
      columnas: 2,
      columnasDetalle: [
        { corte: 1, componentType: 'AUTOEVALUACION' },
        { corte: 2, componentType: 'PARCIALES' },
      ],
      encabezado: { codigoMateria: 'TSI601', nombreMateria: 'NUEVAS TECNOLOGIAS', grupo: 'B191' },
    });
    expect(parsed.columnasDetalle).toEqual([
      { corte: 1, componentType: 'AUTOEVALUACION' },
      { corte: 2, componentType: 'PARCIALES' },
    ]);
  });

  it('un corte o un componente desconocido no pasa: escribiría la nota donde no es', () => {
    expect(() =>
      escaneoNotasSchema.parse({ ...BASE, columnasDetalle: [{ corte: 4, componentType: 'PARCIALES' }] }),
    ).toThrow();
    expect(() =>
      escaneoNotasSchema.parse({ ...BASE, columnasDetalle: [{ corte: 1, componentType: 'QUICES' }] }),
    ).toThrow();
  });
});
