/**
 * Alcance por programa académico: qué ve coordinación y qué ve secretaría.
 * **Lógica pura, sin base de datos.**
 *
 * Un docente se acota por matrícula —sus grupos, sus estudiantes—. Coordinación
 * no: se acota por **carrera**. Ve todos los grupos de los programas que tiene
 * asignados, los dicte quien los dicte, y no ve los de las demás carreras
 * aunque estén en la misma facultad.
 *
 * Dos decisiones que hay que conocer antes de tocar esto:
 *
 * **Sin programas asignados, el alcance es la institución entera.** No es un
 * descuido: hasta ahora un coordinador veía todo, y hacer que «ninguno» valga
 * «nada» habría dejado a las cuentas ya existentes mirando pantallas vacías
 * después de actualizar, sin un solo error que lo explicara. Se restringe
 * asignando programas, que es una decisión visible y auditable.
 *
 * **La materia manda; el docente es el respaldo.** El programa vive en
 * `Materia.programa`, pero los datos anteriores a este cambio no lo tienen. Para
 * esos, el programa se deduce de la adscripción del docente que la dicta
 * (`Profesor.programas`). Sin ese respaldo, actualizar habría vaciado el alcance
 * de todas las materias históricas de golpe.
 */

export type AlcanceDePrograma = {
  /** Ids del catálogo. Vacío cuando el alcance es institucional. */
  programas: string[];
  /**
   * `true` = sin acotar (ADMIN, o un rol por programa sin programas asignados).
   * Cuando es `true` las listas de ids no significan nada y no deben filtrarse.
   */
  total: boolean;
  subjectIds: string[];
  groupIds: string[];
  /** Docentes que dictan algo dentro del alcance. */
  professorIds: string[];
  studentIds: string[];
  /** Institución que acota (`_id`), o `null` si no se acota por institución. */
  institutionId: string | null;
};

export const ALCANCE_TOTAL: AlcanceDePrograma = {
  programas: [],
  total: true,
  subjectIds: [],
  groupIds: [],
  professorIds: [],
  studentIds: [],
  institutionId: null,
};

export type MateriaDeAlcance = {
  _id: unknown;
  professorId?: unknown;
  programa?: string | null;
};

export type GrupoDeAlcance = {
  _id: unknown;
  subjectId?: unknown;
  professorId?: unknown;
};

export type MatriculaDeAlcancePrograma = {
  studentId: unknown;
  subjectId?: unknown;
};

export type DocenteDeAlcance = {
  userId: unknown;
  programas?: string[] | null;
  /** Institución de la ficha. Si el alcance es por institución, decide quién entra. */
  institutionId?: unknown;
};

/**
 * ¿Esta materia cae dentro de los programas pedidos?
 *
 * Se separa del constructor porque es la regla que decide el alcance entero y
 * conviene poder afirmarla sola: una materia con programa propio se juzga por
 * él y **solo** por él —si está marcada como de otra carrera, que la dicte un
 * docente del programa no la mete dentro—; una materia sin programa cae en la
 * adscripción de quien la dicta.
 */
export function materiaEnProgramas(
  materia: MateriaDeAlcance,
  programas: Set<string>,
  programasPorDocente: Map<string, string[]>,
): boolean {
  if (materia.programa) return programas.has(materia.programa);

  const delDocente = programasPorDocente.get(String(materia.professorId ?? '')) ?? [];
  return delDocente.some(programa => programas.has(programa));
}

/**
 * Construye el alcance a partir de lo que devolvió la base.
 *
 * El orden importa: primero las materias (que es lo que el programa marca),
 * luego los grupos y las matrículas de esas materias. Derivar los estudiantes
 * de otra cosa —por ejemplo de `Estudiante.program`— dejaría dentro del alcance
 * a un estudiante de la carrera que no cursa ninguna materia de ella, y fuera a
 * uno de otra carrera que sí está en un grupo del programa. Lo que se coordina
 * son los grupos, no el padrón.
 */
export function construirAlcanceDePrograma(input: {
  programas: string[];
  materias: MateriaDeAlcance[];
  grupos: GrupoDeAlcance[];
  matriculas: MatriculaDeAlcancePrograma[];
  docentes: DocenteDeAlcance[];
  /**
   * Institución de quien consulta. Con ella, **solo entran las materias que
   * dicta un docente de esa institución**, tengan o no programas pedidos; sin
   * ella ni programas, el alcance es total (ADMIN, o una cuenta anterior a
   * los perfiles institucionales).
   */
  institutionId?: string | null;
}): AlcanceDePrograma {
  const programas = [...new Set(input.programas.filter(Boolean))];
  const institucion = input.institutionId ? String(input.institutionId) : null;
  if (programas.length === 0 && !institucion) return { ...ALCANCE_TOTAL };

  const docentesDeLaInstitucion = institucion
    ? new Set(
        input.docentes
          .filter(docente => docente.institutionId != null && String(docente.institutionId) === institucion)
          .map(docente => String(docente.userId)),
      )
    : null;

  const pedidos = new Set(programas);
  const programasPorDocente = new Map<string, string[]>(
    input.docentes.map(docente => [String(docente.userId), docente.programas ?? []]),
  );

  const materias = input.materias.filter(materia => {
    // Una materia de un docente de otra institución no entra ni aunque su
    // programa coincida: el programa es un nombre, la institución es quién.
    if (docentesDeLaInstitucion && !docentesDeLaInstitucion.has(String(materia.professorId ?? ''))) {
      return false;
    }
    return pedidos.size === 0 || materiaEnProgramas(materia, pedidos, programasPorDocente);
  });
  const subjectIds = new Set(materias.map(materia => String(materia._id)));

  const professorIds = new Set<string>();
  for (const materia of materias) {
    if (materia.professorId != null) professorIds.add(String(materia.professorId));
  }
  // Por institución, todos sus docentes cuentan aunque hoy no dicten nada:
  // es lo que permite ver a uno recién aprobado y sin materias todavía.
  if (docentesDeLaInstitucion) {
    for (const id of docentesDeLaInstitucion) professorIds.add(id);
  }

  const groupIds = new Set<string>();
  for (const grupo of input.grupos) {
    if (!subjectIds.has(String(grupo.subjectId))) continue;
    groupIds.add(String(grupo._id));
    // Un grupo puede tener un docente distinto al de la materia (suplencias):
    // si no se sumara aquí, el listado de docentes del programa lo perdería.
    if (grupo.professorId != null) professorIds.add(String(grupo.professorId));
  }

  const studentIds = new Set<string>();
  for (const matricula of input.matriculas) {
    if (!subjectIds.has(String(matricula.subjectId))) continue;
    if (matricula.studentId != null) studentIds.add(String(matricula.studentId));
  }

  return {
    programas,
    total: false,
    subjectIds: [...subjectIds],
    groupIds: [...groupIds],
    professorIds: [...professorIds],
    studentIds: [...studentIds],
    institutionId: institucion,
  };
}

/**
 * Aplica el alcance a un filtro de Mongo, **después** de lo que pidió el cliente.
 *
 * El mismo orden que en `filtroDeListado`, y por la misma razón: si el alcance
 * se escribiera antes, un `?subjectId=` de otra carrera lo sobrescribiría y la
 * respuesta sería un 200 con los datos de un programa ajeno. Cuando el cliente
 * ya pidió un valor concreto, se conserva **solo si está dentro**; si no, el
 * filtro se cierra a nada en vez de ampliarse.
 */
export function acotarPorAlcance(
  filtro: Record<string, unknown>,
  campo: string,
  permitidos: string[],
): Record<string, unknown> {
  const pedido = filtro[campo];

  if (typeof pedido === 'string' && pedido) {
    return { ...filtro, [campo]: permitidos.includes(pedido) ? pedido : SIN_RESULTADOS_ID };
  }

  return { ...filtro, [campo]: { $in: permitidos } };
}

/**
 * Id imposible con forma de `ObjectId`.
 *
 * Tiene que castear: los campos acotados (`subjectId`, `studentId`) son
 * `ObjectId` en los esquemas, y un centinela como `'__fuera__'` haría que
 * Mongoose lanzara `CastError`, que `error.ts` traduce a 404. Quien pide algo
 * fuera de su alcance debe recibir una lista vacía, no un error que parece un
 * fallo del sistema.
 */
export const SIN_RESULTADOS_ID = '000000000000000000000000';

/** ¿Está este id dentro del alcance? Un alcance total contiene todo. */
export function dentroDelAlcanceDePrograma(
  alcance: AlcanceDePrograma,
  campo: 'subjectIds' | 'groupIds' | 'studentIds' | 'professorIds',
  id: unknown,
): boolean {
  if (alcance.total) return true;
  return alcance[campo].includes(String(id));
}
