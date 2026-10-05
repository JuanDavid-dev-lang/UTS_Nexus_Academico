/**
 * Qué se descarga por adelantado para poder trabajar sin conexión.
 *
 * La caché del disco solo guarda lo que el docente ya abrió: con el servidor
 * apagado, una materia que nunca visitó en esta sesión no tendría estudiantes
 * ni notas que enseñar. La precarga recorre en segundo plano las consultas que
 * usan las pantallas de trabajo (las MISMAS, con las mismas claves, para que el
 * persistidor las guarde) mientras hay servidor.
 *
 * Aquí solo se decide QUÉ y CUÁNDO; `core/offline/precarga.ts` ejecuta.
 */

export type TipoDePrecarga =
  | 'periods'
  | 'subjects'
  | 'groups'
  | 'students'
  | 'dashboard'
  | 'enrollments'
  | 'consolidated'
  | 'attendance';

export type TareaDePrecarga = {
  tipo: TipoDePrecarga;
  /** Ámbito de la consulta, cuando la pantalla la pide con uno. */
  scope?: { period: string; subjectId: string; groupId?: string };
};

/** Mínimo entre dos precargas completas. */
export const INTERVALO_DE_PRECARGA_MS = 30 * 60_000;
/** Consultas simultáneas: lo justo para no competir con lo que el docente hace. */
export const CONCURRENCIA_DE_PRECARGA = 2;
/** Tope de tareas por pasada: un docente con muchas materias no debe disparar cientos. */
export const MAX_TAREAS_POR_MATERIAS = 120;

/** La precarga es solo para docentes: son quienes trabajan en aulas sin red. */
export function debePrecargar(input: {
  rol: string | undefined;
  enLinea: boolean;
  enCurso: boolean;
  ultimaVez: number;
  ahora: number;
}): boolean {
  if (input.rol !== 'PROFESSOR') return false;
  if (!input.enLinea || input.enCurso) return false;
  return input.ahora - input.ultimaVez >= INTERVALO_DE_PRECARGA_MS;
}

/** Primera etapa: lo que no depende de nada y dice qué materias y grupos hay. */
export function tareasBase(): TareaDePrecarga[] {
  return [
    { tipo: 'periods' },
    { tipo: 'subjects' },
    { tipo: 'groups' },
    { tipo: 'students' },
    { tipo: 'dashboard' },
  ];
}

/**
 * Segunda etapa: por cada materia del periodo actual, su consolidado, su
 * asistencia y sus matriculados; y lo mismo por cada grupo, porque las
 * pantallas piden con y sin grupo.
 *
 * Las materias vienen de la consulta del docente, que el servidor ya acota a
 * las suyas: aquí no se pide ninguna ajena.
 */
export function tareasPorMateria(input: {
  periodo: string;
  materias: { _id: string; period: string }[];
  grupos: { _id: string; subjectId?: string; period?: string | null }[];
}): TareaDePrecarga[] {
  const tareas: TareaDePrecarga[] = [];

  for (const materia of input.materias) {
    if (materia.period !== input.periodo) continue;
    const base = { period: input.periodo, subjectId: materia._id };

    tareas.push(
      { tipo: 'enrollments', scope: base },
      { tipo: 'consolidated', scope: base },
      { tipo: 'attendance', scope: base },
    );

    for (const grupo of input.grupos) {
      if (grupo.subjectId !== materia._id) continue;
      if (grupo.period && grupo.period !== input.periodo) continue;
      const conGrupo = { ...base, groupId: grupo._id };
      tareas.push(
        { tipo: 'enrollments', scope: conGrupo },
        { tipo: 'consolidated', scope: conGrupo },
      );
    }
  }

  return tareas.slice(0, MAX_TAREAS_POR_MATERIAS);
}
