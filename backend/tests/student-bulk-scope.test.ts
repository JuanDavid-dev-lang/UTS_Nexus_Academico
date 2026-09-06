import { describe, expect, it } from 'vitest';
import { particionarLotePorAlcance } from '../src/domains/scope/professor-scope.js';

/**
 * El agujero que fija esta prueba.
 *
 * `POST /students/bulk` hace un upsert cuyo filtro es la **cédula**, no el id,
 * y no comprobaba nada. `PATCH /students/:id` sí comprueba el alcance, así que
 * el lote era su puerta de atrás: bastaba mandar la cédula de cualquiera —y las
 * cédulas las entrega `GET /students/search`, que es el directorio global— para
 * reescribirle nombre, programa y correo.
 *
 * Lo que estas pruebas fijan no es «se comprueba algo», es **dónde está la
 * línea**: crear a quien no existe se permite siempre (es el trabajo de la
 * ruta), modificar a quien ya existe solo dentro del alcance.
 */
describe('alcance de la escritura por lotes de estudiantes', () => {
  const existentes = [
    { id: 'est-propio', code: '1098000001' },
    { id: 'est-ajeno', code: '1098000002' },
  ];
  const alcanceAcotado = { total: false, studentIds: ['est-propio'] };

  it('deja pasar el lote entero cuando el alcance es total', () => {
    const filas = [{ code: '1098000001' }, { code: '1098000002' }];
    const resultado = particionarLotePorAlcance(filas, existentes, {
      total: true,
      studentIds: [],
    });
    expect(resultado.permitidas).toHaveLength(2);
    expect(resultado.rechazadas).toEqual([]);
  });

  it('permite modificar a un estudiante del propio alcance', () => {
    const resultado = particionarLotePorAlcance(
      [{ code: '1098000001' }],
      existentes,
      alcanceAcotado,
    );
    expect(resultado.permitidas).toEqual([{ code: '1098000001' }]);
    expect(resultado.rechazadas).toEqual([]);
  });

  it('rechaza modificar a un estudiante que ya existe y está fuera del alcance', () => {
    const resultado = particionarLotePorAlcance(
      [{ code: '1098000002' }],
      existentes,
      alcanceAcotado,
    );
    expect(resultado.permitidas).toEqual([]);
    expect(resultado.rechazadas).toEqual(['1098000002']);
  });

  it('permite crear a alguien que todavía no existe, aunque el alcance sea acotado', () => {
    // Es el trabajo legítimo de la ruta: importar un listado trae gente nueva.
    const resultado = particionarLotePorAlcance(
      [{ code: '1098999999' }],
      existentes,
      alcanceAcotado,
    );
    expect(resultado.permitidas).toEqual([{ code: '1098999999' }]);
    expect(resultado.rechazadas).toEqual([]);
  });

  it('separa fila a fila: una ajena no arrastra a las demás', () => {
    const filas = [
      { code: '1098000001' }, // propio  → pasa
      { code: '1098000002' }, // ajeno   → se rechaza
      { code: '1098999999' }, // nuevo   → pasa
    ];
    const resultado = particionarLotePorAlcance(filas, existentes, alcanceAcotado);
    expect(resultado.permitidas.map(f => f.code)).toEqual(['1098000001', '1098999999']);
    expect(resultado.rechazadas).toEqual(['1098000002']);
  });

  it('conserva los campos de la fila, no solo la cédula', () => {
    // La partición decide qué pasa; no puede quedarse por el camino lo que se
    // va a escribir.
    const filas = [{ code: '1098999999', fullName: 'Ana Pérez', program: 'ADS' }];
    const resultado = particionarLotePorAlcance(filas, existentes, alcanceAcotado);
    expect(resultado.permitidas[0]).toEqual(filas[0]);
  });

  it('un alcance vacío no deja modificar nada existente, pero sigue dejando crear', () => {
    const sinNada = { total: false, studentIds: [] };
    const resultado = particionarLotePorAlcance(
      [{ code: '1098000001' }, { code: '1098999999' }],
      existentes,
      sinNada,
    );
    expect(resultado.permitidas.map(f => f.code)).toEqual(['1098999999']);
    expect(resultado.rechazadas).toEqual(['1098000001']);
  });
});
