import { describe, expect, it } from 'vitest';
import { avisoSchema } from '@/domain/schemas/academic';

/**
 * El aviso llega con dos formas distintas según de dónde venga.
 *
 * El listado lo devuelve con el autor poblado; la respuesta de crear traía el
 * ObjectId a secas, porque Mongoose no puebla lo que acaba de insertar. Con el
 * esquema aceptando solo la primera, publicar terminaba siempre en «El servidor
 * respondió en un formato inesperado» con el aviso ya guardado — el
 * administrador reintentaba y salían duplicados.
 */
const BASE = {
  _id: '65f0000000000000000000aa',
  titulo: 'Cierre de notas del segundo corte',
  cuerpo: 'Las notas del corte 2 se cierran el viernes.',
  tipo: 'INFORMATIVO' as const,
  publicadoEn: '2026-08-03T12:00:00.000Z',
};

describe('avisoSchema', () => {
  it('acepta la respuesta de crear, con el autor sin poblar', () => {
    const parsed = avisoSchema.parse({ ...BASE, autorId: '65f0000000000000000000bb' });

    expect(parsed.titulo).toBe(BASE.titulo);
    // Un id sin nombre no es un autor que se pueda mostrar.
    expect(parsed.autorId).toBeNull();
  });

  it('acepta el listado, con el autor poblado', () => {
    const parsed = avisoSchema.parse({ ...BASE, autorId: { fullName: 'Ana Ríos' } });

    expect(parsed.autorId?.fullName).toBe('Ana Ríos');
  });

  it('acepta que no venga autor', () => {
    expect(avisoSchema.parse(BASE).autorId).toBeNull();
    expect(avisoSchema.parse({ ...BASE, autorId: null }).autorId).toBeNull();
  });

  it('rellena los campos que solo existen en el listado', () => {
    const parsed = avisoSchema.parse(BASE);

    expect(parsed.leido).toBe(false);
    expect(parsed.lecturas).toBe(0);
    expect(parsed.sedes).toEqual([]);
    expect(parsed.programas).toEqual([]);
  });
});
