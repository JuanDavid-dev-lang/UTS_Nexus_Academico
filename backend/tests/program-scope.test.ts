import { describe, expect, it } from 'vitest';
import {
  acotarPorAlcance,
  construirAlcanceDePrograma,
  dentroDelAlcanceDePrograma,
  materiaEnProgramas,
  SIN_RESULTADOS_ID,
  ALCANCE_TOTAL,
} from '../src/domains/scope/program-scope.js';
import { filtroDeListado } from '../src/domains/scope/professor-scope.js';

const docentes = [
  { userId: 'doc-sistemas', programas: ['ING_SISTEMAS'] },
  { userId: 'doc-civil', programas: ['ING_CIVIL'] },
];

const materias = [
  { _id: 'mat-sistemas', professorId: 'doc-sistemas', programa: 'ING_SISTEMAS' },
  // Sin programa propio: entra por la adscripción de quien la dicta.
  { _id: 'mat-legada', professorId: 'doc-sistemas', programa: null },
  { _id: 'mat-civil', professorId: 'doc-civil', programa: 'ING_CIVIL' },
  // Marcada como de otra carrera aunque la dicte un docente de sistemas.
  { _id: 'mat-prestada', professorId: 'doc-sistemas', programa: 'ING_CIVIL' },
];

const grupos = [
  { _id: 'gru-1', subjectId: 'mat-sistemas', professorId: 'doc-sistemas' },
  { _id: 'gru-2', subjectId: 'mat-legada', professorId: 'doc-suplente' },
  { _id: 'gru-3', subjectId: 'mat-civil', professorId: 'doc-civil' },
];

const matriculas = [
  { studentId: 'est-1', subjectId: 'mat-sistemas' },
  { studentId: 'est-2', subjectId: 'mat-legada' },
  { studentId: 'est-3', subjectId: 'mat-civil' },
];

function alcanceDe(programas: string[]) {
  return construirAlcanceDePrograma({ programas, materias, grupos, matriculas, docentes });
}

describe('alcance por programa', () => {
  it('sin programas asignados el alcance es la institución entera', () => {
    // Es lo que estas cuentas veían antes de que existiera el alcance: cerrarlo
    // a «nada» habría dejado a las ya creadas mirando pantallas vacías tras
    // actualizar, sin un error que lo explicara.
    expect(alcanceDe([]).total).toBe(true);
  });

  it('trae las materias de la carrera y las legadas de sus docentes', () => {
    const alcance = alcanceDe(['ING_SISTEMAS']);
    expect(alcance.total).toBe(false);
    expect(alcance.subjectIds).toContain('mat-sistemas');
    expect(alcance.subjectIds).toContain('mat-legada');
  });

  it('una materia marcada de otra carrera no entra por su docente', () => {
    // La materia manda sobre la adscripción: es el único dato declarado.
    expect(alcanceDe(['ING_SISTEMAS']).subjectIds).not.toContain('mat-prestada');
    expect(
      materiaEnProgramas(
        { _id: 'mat-prestada', professorId: 'doc-sistemas', programa: 'ING_CIVIL' },
        new Set(['ING_SISTEMAS']),
        new Map([['doc-sistemas', ['ING_SISTEMAS']]]),
      ),
    ).toBe(false);
  });

  it('no deja pasar las materias de otra carrera', () => {
    const alcance = alcanceDe(['ING_SISTEMAS']);
    expect(alcance.subjectIds).not.toContain('mat-civil');
    expect(alcance.groupIds).not.toContain('gru-3');
    expect(alcance.studentIds).not.toContain('est-3');
  });

  it('suma al docente suplente de un grupo, que no está adscrito', () => {
    // Si solo se miraran las adscripciones, el listado de docentes del programa
    // perdería justo a quien está dictando las clases.
    expect(alcanceDe(['ING_SISTEMAS']).professorIds).toContain('doc-suplente');
  });

  it('los estudiantes salen de la matrícula, no del padrón', () => {
    const alcance = alcanceDe(['ING_SISTEMAS']);
    expect(alcance.studentIds.sort()).toEqual(['est-1', 'est-2']);
  });
});

describe('acotarPorAlcance', () => {
  it('acota cuando no se pidió nada', () => {
    expect(acotarPorAlcance({}, 'subjectId', ['a', 'b'])).toEqual({
      subjectId: { $in: ['a', 'b'] },
    });
  });

  it('conserva lo pedido cuando está dentro', () => {
    expect(acotarPorAlcance({ subjectId: 'a' }, 'subjectId', ['a', 'b'])).toEqual({
      subjectId: 'a',
    });
  });

  it('cierra a nada lo pedido fuera del alcance', () => {
    // Y con forma de ObjectId: un centinela de texto haría que Mongoose lanzara
    // CastError, que el traductor de errores convierte en un 404 — un error que
    // parece del sistema donde debería haber una lista vacía.
    expect(acotarPorAlcance({ subjectId: 'z' }, 'subjectId', ['a']).subjectId).toBe(
      SIN_RESULTADOS_ID,
    );
  });
});

describe('filtroDeListado con alcance por programa', () => {
  const alcance = alcanceDe(['ING_SISTEMAS']);

  it('acota las notas de coordinación a sus materias', () => {
    const filtro = filtroDeListado({}, { id: 'u1', role: 'COORDINATOR' }, {}, alcance);
    expect(filtro.subjectId).toEqual({ $in: alcance.subjectIds });
  });

  it('pedir una materia de otra carrera devuelve vacío, no sus notas', () => {
    const filtro = filtroDeListado(
      { subjectId: 'mat-civil' },
      { id: 'u1', role: 'SECRETARY' },
      {},
      alcance,
    );
    expect(filtro.subjectId).toBe(SIN_RESULTADOS_ID);
  });

  it('no toca el filtro de un docente ni el de un estudiante', () => {
    const docente = filtroDeListado({}, { id: 'doc-1', role: 'PROFESSOR' }, {}, alcance);
    expect(docente.teacherId).toBe('doc-1');
    expect(docente.subjectId).toBeUndefined();

    const estudiante = filtroDeListado(
      { studentId: 'otro' },
      { id: 'u2', role: 'STUDENT', studentId: 'propio' },
      {},
      alcance,
    );
    expect(estudiante.studentId).toBe('propio');
  });

  it('con alcance total no acota nada', () => {
    const filtro = filtroDeListado({}, { id: 'u1', role: 'COORDINATOR' }, {}, ALCANCE_TOTAL);
    expect(filtro.subjectId).toBeUndefined();
  });
});

describe('dentroDelAlcanceDePrograma', () => {
  it('un alcance total contiene todo', () => {
    expect(dentroDelAlcanceDePrograma(ALCANCE_TOTAL, 'studentIds', 'cualquiera')).toBe(true);
  });

  it('compara en texto: el id que llega por la URL es una cadena', () => {
    const alcance = alcanceDe(['ING_SISTEMAS']);
    expect(dentroDelAlcanceDePrograma(alcance, 'studentIds', 'est-1')).toBe(true);
    expect(dentroDelAlcanceDePrograma(alcance, 'studentIds', 'est-3')).toBe(false);
  });
});

describe('alcance por institución', () => {
  const docentesConInstitucion = [
    { userId: 'doc-sistemas', programas: ['ING_SISTEMAS'], institutionId: 'uts' },
    { userId: 'doc-civil', programas: ['ING_CIVIL'], institutionId: 'uts' },
    { userId: 'doc-udes', programas: ['ING_SISTEMAS'], institutionId: 'udes' },
    // Recién aprobado, sin materias todavía.
    { userId: 'doc-nuevo-udes', programas: [], institutionId: 'udes' },
  ];
  const materiasConInstitucion = [
    ...materias,
    { _id: 'mat-udes', professorId: 'doc-udes', programa: 'ING_SISTEMAS' },
  ];
  const gruposConInstitucion = [...grupos, { _id: 'gru-udes', subjectId: 'mat-udes', professorId: 'doc-udes' }];
  const matriculasConInstitucion = [...matriculas, { studentId: 'est-udes', subjectId: 'mat-udes' }];

  function alcanceDeInstitucion(institutionId: string | null, programas: string[] = []) {
    return construirAlcanceDePrograma({
      programas,
      materias: materiasConInstitucion,
      grupos: gruposConInstitucion,
      matriculas: matriculasConInstitucion,
      docentes: docentesConInstitucion,
      institutionId,
    });
  }

  it('sin programas pero con institución, el alcance es la institución entera y no es total', () => {
    const alcance = alcanceDeInstitucion('udes');
    expect(alcance.total).toBe(false);
    expect(alcance.institutionId).toBe('udes');
    expect(alcance.subjectIds).toEqual(['mat-udes']);
    expect(alcance.studentIds).toEqual(['est-udes']);
    expect(alcance.groupIds).toEqual(['gru-udes']);
  });

  it('incluye a los docentes de la institución aunque aún no dicten nada', () => {
    expect(alcanceDeInstitucion('udes').professorIds).toEqual(
      expect.arrayContaining(['doc-udes', 'doc-nuevo-udes']),
    );
    expect(alcanceDeInstitucion('udes').professorIds).not.toContain('doc-sistemas');
  });

  it('con programas, una materia del mismo programa en otra institución no entra', () => {
    const alcance = alcanceDeInstitucion('uts', ['ING_SISTEMAS']);
    expect(alcance.subjectIds).toContain('mat-sistemas');
    expect(alcance.subjectIds).not.toContain('mat-udes');
    expect(alcance.studentIds).not.toContain('est-udes');
  });

  it('sin institución ni programas sigue siendo total (ADMIN y cuentas anteriores)', () => {
    expect(alcanceDeInstitucion(null).total).toBe(true);
    expect(ALCANCE_TOTAL.institutionId).toBeNull();
  });
});
