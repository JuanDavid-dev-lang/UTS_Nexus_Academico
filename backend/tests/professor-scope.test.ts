/**
 * Alcance de un docente.
 *
 * Es la garantía más importante del sistema y hasta ahora no tenía una sola
 * prueba, porque vivía dentro de funciones que consultaban Mongo. Lo que se
 * fija aquí no es una preferencia de diseño: es que un docente no vea a los
 * estudiantes de otro.
 *
 * El fallo que estas pruebas atrapan no se parece a un error. Nadie ve una
 * excepción: la lista sale bien formada, con las personas equivocadas dentro.
 */
import { describe, expect, it } from 'vitest';
import {
  construirAlcance,
  dentroDelAlcance,
  filtroDeListado,
  filtroDeMatricula,
  intersectar,
  type ProfessorScope,
} from '../src/domains/scope/professor-scope.js';

/** Imita un ObjectId de Mongoose: no es una cadena, pero se convierte en una. */
const oid = (valor: string) => ({ toString: () => valor });

const materia = (id: string, studentIds?: unknown[]) => ({ _id: oid(id), studentIds });
const grupo = materia;
const matricula = (studentId: string) => ({ studentId: oid(studentId) });

describe('construirAlcance', () => {
  it('sin nada, el alcance es vacío — nunca "todos"', () => {
    // El caso que importa: un docente recién creado no debe ver a nadie. Si un
    // alcance vacío se interpretara como "sin filtro", vería a toda la
    // institución, que es el peor fallo posible aquí.
    expect(construirAlcance([], [], [])).toEqual({
      subjectIds: [],
      groupIds: [],
      studentIds: [],
    });
  });

  it('la matrícula es la fuente de los estudiantes', () => {
    const scope = construirAlcance(
      [materia('m1')],
      [grupo('g1')],
      [matricula('e1'), matricula('e2')],
    );
    expect(scope.studentIds).toEqual(['e1', 'e2']);
    expect(scope.subjectIds).toEqual(['m1']);
    expect(scope.groupIds).toEqual(['g1']);
  });

  it('las listas legadas SUMAN, no sustituyen', () => {
    // Un docente puede tener grupos migrados a Matrícula y otros sin migrar.
    // Quedarse solo con una de las dos fuentes le vacía media asignatura.
    const scope = construirAlcance(
      [materia('m1', [oid('legado1')])],
      [grupo('g1', [oid('legado2')])],
      [matricula('nuevo1')],
    );
    expect(scope.studentIds.sort()).toEqual(['legado1', 'legado2', 'nuevo1']);
  });

  it('un estudiante en dos sitios aparece una vez', () => {
    const scope = construirAlcance(
      [materia('m1', [oid('e1')])],
      [grupo('g1', [oid('e1')])],
      [matricula('e1')],
    );
    expect(scope.studentIds).toEqual(['e1']);
  });

  it('normaliza los ObjectId a texto', () => {
    // Sin normalizar, comparar el alcance con un id que llegó por la URL
    // —que siempre es texto— daría falso para un estudiante que sí es suyo.
    const scope = construirAlcance([], [], [matricula('507f1f77bcf86cd799439011')]);
    expect(scope.studentIds).toEqual(['507f1f77bcf86cd799439011']);
    expect(typeof scope.studentIds[0]).toBe('string');
  });

  it('aguanta listas legadas ausentes o nulas', () => {
    const scope = construirAlcance(
      [{ _id: oid('m1') }, { _id: oid('m2'), studentIds: null }],
      [],
      [],
    );
    expect(scope.studentIds).toEqual([]);
    expect(scope.subjectIds).toEqual(['m1', 'm2']);
  });

  it('descarta entradas nulas en vez de convertirlas en el texto "null"', () => {
    // `String(null)` es "null", un id falso que casaría con otro id falso.
    const scope = construirAlcance([materia('m1', [null, oid('e1')])], [], []);
    expect(scope.studentIds).toEqual(['e1']);
  });
});

describe('filtroDeMatricula', () => {
  it('siempre exige matrícula activa y no borrada', () => {
    // Sin esto, un estudiante retirado seguiría apareciendo en las listas.
    expect(filtroDeMatricula({})).toEqual({
      deletedAt: null,
      enrollmentStatus: 'ACTIVE',
    });
  });

  it('los criterios se ACUMULAN: el docente no se pierde al filtrar', () => {
    // ESTA es la regla que impide que pedir una materia ajena devuelva su
    // lista. Si `professorId` dejara de añadirse, la consulta seguiría
    // funcionando y devolvería los estudiantes de otro docente.
    const query = filtroDeMatricula({ professorId: 'p1', subjectId: 'm1' });
    expect(query).toEqual({
      deletedAt: null,
      enrollmentStatus: 'ACTIVE',
      professorId: 'p1',
      subjectId: 'm1',
    });
  });

  it('acepta los cuatro criterios a la vez', () => {
    const query = filtroDeMatricula({
      professorId: 'p1',
      subjectId: 'm1',
      groupId: 'g1',
      period: '2026-1',
    });
    expect(Object.keys(query).sort()).toEqual([
      'deletedAt',
      'enrollmentStatus',
      'groupId',
      'period',
      'professorId',
      'subjectId',
    ]);
  });

  it('un criterio vacío no se añade y tampoco abre el filtro', () => {
    const query = filtroDeMatricula({ professorId: '', subjectId: 'm1' });
    expect(query).not.toHaveProperty('professorId');
    expect(query.subjectId).toBe('m1');
  });
});

describe('dentroDelAlcance', () => {
  const scope: ProfessorScope = {
    subjectIds: ['m1'],
    groupIds: ['g1'],
    studentIds: ['e1', 'e2'],
  };

  it('deja pasar al estudiante propio', () => {
    expect(dentroDelAlcance(scope, 'e1')).toBe(true);
  });

  it('rechaza al ajeno aunque el id exista', () => {
    // El caso de copiar un id de otra pantalla: la ficha no puede abrirse solo
    // porque el estudiante exista.
    expect(dentroDelAlcance(scope, 'e99')).toBe(false);
  });

  it('un alcance vacío no deja pasar a nadie', () => {
    expect(dentroDelAlcance({ subjectIds: [], groupIds: [], studentIds: [] }, 'e1')).toBe(false);
  });

  it('compara un ObjectId igual que su texto', () => {
    expect(dentroDelAlcance(scope, oid('e1'))).toBe(true);
  });

  it('no confunde un id con otro que lo contenga', () => {
    expect(dentroDelAlcance({ ...scope, studentIds: ['abc123'] }, 'abc')).toBe(false);
  });
});

describe('intersectar', () => {
  it('el filtro acota el alcance, no lo reemplaza', () => {
    // Pedir una materia ajena devuelve vacío, nunca los datos del otro.
    expect(intersectar(['e1', 'e2'], ['e9'])).toEqual([]);
    expect(intersectar(['e1', 'e2'], ['e2', 'e3'])).toEqual(['e2']);
  });

  it('preserva el orden del alcance del docente', () => {
    expect(intersectar(['c', 'a', 'b'], ['b', 'a', 'c'])).toEqual(['c', 'a', 'b']);
  });

  it('intersecar con vacío da vacío, no el conjunto entero', () => {
    expect(intersectar(['e1'], [])).toEqual([]);
  });
});

describe('filtroDeListado', () => {
  const docente = { id: 'p1', role: 'PROFESSOR' };
  const estudiante = { id: 'u9', role: 'STUDENT', studentId: 'e9' };
  const admin = { id: 'a1', role: 'ADMIN' };

  it('un estudiante NO puede leer las notas de otro por la URL', () => {
    // Regresión de un fallo real que estaba vivo en `GET /grades`: el ámbito
    // del estudiante se aplicaba antes que el filtro de la URL, así que
    // `?studentId=otro` lo sobrescribía. La respuesta era un 200 con una lista
    // bien formada de las notas de otra persona.
    expect(filtroDeListado({ studentId: 'e_ajeno' }, estudiante).studentId).toBe('e9');
  });

  it('un docente no puede pedir lo de otro docente', () => {
    expect(filtroDeListado({}, docente).teacherId).toBe('p1');
  });

  it('un estudiante sin ficha vinculada no ve nada, en vez de verlo todo', () => {
    // El caso peligroso: sin ficha, `studentId` sería `undefined` y quedaría
    // fuera del filtro — es decir, sin acotar. Se cierra a un id imposible.
    // Con forma de ObjectId (24 ceros hex) para no chocar con el cast de
    // Mongoose: un valor sin esa forma provoca un CastError que error.ts
    // traduce a 404, en vez de la lista vacía que se busca.
    const filtro = filtroDeListado({}, { id: 'u1', role: 'STUDENT' });
    expect(filtro.studentId).toBe('000000000000000000000000');
    expect(filtro.studentId).toMatch(/^[0-9a-f]{24}$/);
  });

  it('un ADMIN sí puede acotar por estudiante', () => {
    expect(filtroDeListado({ studentId: 'e1' }, admin).studentId).toBe('e1');
  });

  it('a un ADMIN no se le impone ningún ámbito', () => {
    expect(filtroDeListado({}, admin)).toEqual({ deletedAt: null });
  });

  it('el estudiante conserva los demás criterios que pidió', () => {
    // Acotarlo a sí mismo no debe impedirle filtrar por materia.
    const filtro = filtroDeListado({ subjectId: 'm1', period: '2026-1' }, estudiante);
    expect(filtro).toEqual({
      deletedAt: null,
      subjectId: 'm1',
      period: '2026-1',
      studentId: 'e9',
    });
  });

  it('nunca devuelve registros borrados', () => {
    expect(filtroDeListado({}, undefined).deletedAt).toBeNull();
  });

  it('acepta una base extra sin perder el acotado del rol', () => {
    const filtro = filtroDeListado({}, docente, { corte: 1 });
    expect(filtro).toEqual({ deletedAt: null, corte: 1, teacherId: 'p1' });
  });

  it('sin sesión no impone ámbito pero tampoco lo inventa', () => {
    expect(filtroDeListado({ subjectId: 'm1' }, undefined)).toEqual({
      deletedAt: null,
      subjectId: 'm1',
    });
  });
});
