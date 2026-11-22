import { describe, expect, it } from 'vitest';
import {
  diferenciasDeOpciones,
  mismaClave,
  nombrePorDefecto,
  planearIndice,
  valoresRepetidos,
} from '../src/shared/reparar-indices.js';

describe('planearIndice', () => {
  it('reemplaza un expiresAt_1 sin TTL por el índice de caducidad del modelo', () => {
    const plan = planearIndice(
      [
        { name: '_id_', key: { _id: 1 } },
        { name: 'expiresAt_1', key: { expiresAt: 1 } },
      ],
      { key: { expiresAt: 1 }, opciones: { expireAfterSeconds: 0 } },
    );
    expect(plan.accion).toBe('reemplazar');
    if (plan.accion !== 'reemplazar') return;
    expect(plan.nombre).toBe('expiresAt_1');
    expect(plan.anterior.name).toBe('expiresAt_1');
    expect(plan.motivo).toContain('expireAfterSeconds');
  });

  it('reemplaza un índice normal por el único que declara el modelo', () => {
    const plan = planearIndice([{ name: 'signature_1', key: { signature: 1 } }], {
      key: { signature: 1 },
      opciones: { unique: true },
    });
    expect(plan.accion).toBe('reemplazar');
    if (plan.accion === 'reemplazar') expect(plan.motivo).toContain('unique: false → true');
  });

  it('no toca nada si el índice ya coincide, aunque el filtro parcial venga en otro orden', () => {
    const plan = planearIndice(
      [
        {
          name: 'x_1',
          key: { x: 1 },
          unique: true,
          partialFilterExpression: { email: { $type: 'string' }, deletedAt: null },
        },
      ],
      { key: { x: 1 }, opciones: { unique: true, partialFilterExpression: { deletedAt: null, email: { $type: 'string' } } } },
    );
    expect(plan.accion).toBe('nada');
  });

  it('crea el índice si no existe ninguno con esa clave', () => {
    const plan = planearIndice([{ name: '_id_', key: { _id: 1 } }], { key: { a: 1, b: -1 }, opciones: {} });
    expect(plan).toMatchObject({ accion: 'crear', nombre: 'a_1_b_-1' });
  });

  it('distingue el filtro parcial: uno sin filtro no sirve donde el modelo pide uno', () => {
    const plan = planearIndice([{ name: 'claves_1', key: { claves: 1 }, unique: true }], {
      key: { claves: 1 },
      opciones: { unique: true, partialFilterExpression: { deletedAt: null } },
    });
    expect(plan.accion).toBe('reemplazar');
  });
});

describe('utilidades de clave', () => {
  it('el orden de los campos importa', () => {
    expect(mismaClave({ a: 1, b: 1 }, { a: 1, b: 1 })).toBe(true);
    expect(mismaClave({ a: 1, b: 1 }, { b: 1, a: 1 })).toBe(false);
    expect(mismaClave({ a: 1 }, { a: -1 })).toBe(false);
  });

  it('nombra como Mongo', () => {
    expect(nombrePorDefecto({ status: 1, lastSeenAt: -1 })).toBe('status_1_lastSeenAt_-1');
  });

  it('un TTL ausente y uno en cero no son lo mismo', () => {
    expect(diferenciasDeOpciones({}, { expireAfterSeconds: 0 })).toHaveLength(1);
    expect(diferenciasDeOpciones({ expireAfterSeconds: 0 }, { expireAfterSeconds: 0 })).toHaveLength(0);
  });
});

describe('valoresRepetidos', () => {
  it('cuenta documentos distintos, no apariciones', () => {
    expect(
      valoresRepetidos([
        { valor: 'uts', docId: '1' },
        { valor: 'uts', docId: '1' },
        { valor: 'uis', docId: '2' },
        { valor: 'uis', docId: '3' },
      ]),
    ).toEqual([{ valor: 'uis', docs: 2 }]);
  });
});
