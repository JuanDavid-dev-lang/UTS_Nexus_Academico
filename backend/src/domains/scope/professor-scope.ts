/**
 * Alcance de un docente: quién puede ver qué. **Lógica pura, sin base de datos.**
 *
 * Esta es la garantía más importante del sistema: lo único que impide que un
 * docente vea las notas, la asistencia y los datos personales de los
 * estudiantes de otro. Y hasta ahora vivía entera dentro de funciones que
 * consultaban Mongo, así que no había forma de probarla sin levantar un
 * servidor y una base — es decir, no se probaba.
 *
 * El fallo que esto previene no se parece a un error: nadie ve una excepción.
 * Un `Set` mal construido o un filtro que reemplaza en vez de intersecar
 * devuelve una lista de estudiantes perfectamente formada, solo que con las
 * personas equivocadas dentro. Se descubre cuando alguien reconoce un nombre
 * que no debería estar ahí.
 *
 * Por eso el cálculo se separa de la consulta: la consulta trae documentos, y
 * lo que se hace con ellos se decide aquí, donde una prueba puede afirmarlo.
 */

import { acotarPorAlcance, type AlcanceDePrograma } from './program-scope.js';

export type ProfessorScope = {
  subjectIds: string[];
  groupIds: string[];
  studentIds: string[];
};

/** Documento de materia o grupo, con el respaldo legado de estudiantes. */
export type ContenedorConEstudiantes = {
  _id: unknown;
  studentIds?: unknown[] | null;
};

/** Matrícula, reducida a lo que el alcance necesita. */
export type MatriculaDeAlcance = {
  studentId: unknown;
};

/**
 * Construye el alcance a partir de lo que devolvió la base.
 *
 * La fuente principal es la matrícula. Las listas `studentIds[]` de materia y
 * grupo son un respaldo de antes de que existiera la colección Matrícula: se
 * **suman**, nunca sustituyen, porque un docente puede tener grupos migrados y
 * sin migrar a la vez y quitarle los viejos le vaciaría media asignatura.
 */
export function construirAlcance(
  materias: ContenedorConEstudiantes[],
  grupos: ContenedorConEstudiantes[],
  matriculas: MatriculaDeAlcance[],
): ProfessorScope {
  const studentIds = new Set<string>();

  for (const matricula of matriculas) {
    if (matricula.studentId != null) studentIds.add(String(matricula.studentId));
  }

  // Respaldo legado (datos previos a Matrícula).
  for (const contenedor of [...materias, ...grupos]) {
    for (const id of contenedor.studentIds ?? []) {
      if (id != null) studentIds.add(String(id));
    }
  }

  return {
    subjectIds: materias.map(materia => String(materia._id)),
    groupIds: grupos.map(grupo => String(grupo._id)),
    studentIds: [...studentIds],
  };
}

export type EnrollmentFilter = {
  subjectId?: string;
  groupId?: string;
  period?: string;
  professorId?: string;
};

/**
 * Filtro de matrícula para un ámbito concreto.
 *
 * **Los criterios se acumulan; ninguno sustituye a otro.** Es la regla que
 * impide que pedir una materia ajena devuelva su lista: con `professorId` y
 * `subjectId` juntos, una materia que no es suya no casa con nada y el
 * resultado es vacío. Si alguna vez uno de los dos dejara de añadirse al
 * filtro, la consulta seguiría funcionando y devolvería la lista de otro
 * docente sin un solo error.
 */
export function filtroDeMatricula(filter: EnrollmentFilter): Record<string, unknown> {
  const query: Record<string, unknown> = { deletedAt: null, enrollmentStatus: 'ACTIVE' };
  if (filter.subjectId) query.subjectId = filter.subjectId;
  if (filter.groupId) query.groupId = filter.groupId;
  if (filter.period) query.period = filter.period;
  if (filter.professorId) query.professorId = filter.professorId;
  return query;
}

/**
 * ¿Está este estudiante dentro del alcance?
 *
 * Compara en texto a propósito: el alcance se guarda como cadenas y el id que
 * llega por la URL también lo es, pero el que sale de un documento de Mongoose
 * es un `ObjectId`. Comparar sin normalizar da `false` para un estudiante que
 * sí es del docente, y eso se manifiesta como un 403 intermitente que aparece
 * solo por algunos caminos.
 */
export function dentroDelAlcance(scope: ProfessorScope, studentId: unknown): boolean {
  return scope.studentIds.includes(String(studentId));
}

/** Intersección de dos conjuntos de ids, preservando el orden del primero. */
export function intersectar(a: string[], b: string[]): string[] {
  const permitidos = new Set(b);
  return a.filter(id => permitidos.has(id));
}

// ── Acotado de un listado por rol ───────────────────────────────────────────

export type SolicitanteConAlcance = {
  id: string;
  role: string;
  /** Ficha de estudiante vinculada, cuando el rol es STUDENT. */
  studentId?: string;
};

export type CriteriosDeListado = {
  studentId?: unknown;
  subjectId?: unknown;
  groupId?: unknown;
  period?: unknown;
};

/**
 * Filtro de un listado académico, con el ámbito del rol aplicado **al final**.
 *
 * El orden es la regla entera, y no es una preferencia de estilo. Escrito así:
 *
 *     if (rol === 'STUDENT') filtro.studentId = usuario.studentId;
 *     if (query.studentId)   filtro.studentId = query.studentId;   // ← pisa
 *
 * el estudiante queda acotado y acto seguido su propio acotado se sobrescribe
 * con lo que venga en la URL: `?studentId=<otro>` devuelve las notas de otro
 * estudiante, con un 200 y una lista bien formada. Ese fallo estaba en
 * `GET /grades` y no en `GET /attendance`, con el mismo código y solo dos
 * líneas intercambiadas — que es exactamente por qué esto vive en una función
 * y no copiado en cada ruta.
 *
 * Lo que el rol impone va después de lo que pide el cliente, siempre. Un
 * docente no elige de qué docente son las notas; un estudiante no elige de qué
 * estudiante.
 */
/**
 * Id imposible con forma de `ObjectId` (24 ceros hexadecimales).
 *
 * Cierra el listado de un estudiante sin ficha vinculada a "nada", pero tiene
 * que seguir pareciendo un `ObjectId` de Mongoose: `studentId` es un campo
 * `ObjectId` en Nota y en Asistencia, y un valor como `'__sin_estudiante__'`
 * no castea — Mongoose lanza `CastError`, que `error.ts` traduce a 404. Un
 * estudiante sin ficha vinculada pedía "sin resultados" y recibía un error
 * genérico en su lugar. Con forma de `ObjectId` el filtro casa limpio y no
 * encuentra nada, que es justo lo que se buscaba.
 */
const SIN_ESTUDIANTE_ID = '000000000000000000000000';

export function filtroDeListado(
  criterios: CriteriosDeListado,
  usuario?: SolicitanteConAlcance,
  base: Record<string, unknown> = {},
  alcance?: AlcanceDePrograma,
): Record<string, unknown> {
  let filtro: Record<string, unknown> = { deletedAt: null, ...base };

  // 1) Lo que pide quien consulta.
  if (criterios.studentId) filtro.studentId = String(criterios.studentId);
  if (criterios.subjectId) filtro.subjectId = String(criterios.subjectId);
  if (criterios.groupId) filtro.groupId = String(criterios.groupId);
  if (criterios.period) filtro.period = String(criterios.period);

  // 2) Lo que su rol le impone. Va al final: manda sobre lo anterior.
  if (usuario?.role === 'PROFESSOR') filtro.teacherId = usuario.id;
  if (usuario?.role === 'STUDENT') {
    // Sin ficha vinculada no se abre el listado a todos: se cierra a nada.
    filtro.studentId = usuario.studentId ?? SIN_ESTUDIANTE_ID;
  }

  // 3) Coordinación y secretaría se acotan por carrera, no por matrícula: ven
  //    las materias de sus programas, las dicte quien las dicte. Va después de
  //    lo que pide la URL por la misma razón que lo anterior — pedir una
  //    materia de otra carrera devuelve vacío, nunca sus notas.
  if (alcance && !alcance.total && esRolPorProgramaEnAlcance(usuario?.role)) {
    filtro = acotarPorAlcance(filtro, 'subjectId', alcance.subjectIds);
  }

  return filtro;
}

/**
 * Copia local de la lista de roles acotados por programa.
 *
 * `shared/types.ts` no se importa desde aquí a propósito: `domains/` es puro y
 * no depende de la capa de infraestructura. Son dos nombres; si algún día son
 * cinco, la lista se sube a un módulo de dominio compartido.
 */
function esRolPorProgramaEnAlcance(role?: string): boolean {
  return role === 'COORDINATOR' || role === 'SECRETARY';
}
