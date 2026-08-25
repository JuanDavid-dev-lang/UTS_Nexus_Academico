import { SubjectModel } from '../../models/subject.model.js';
import { GroupModel } from '../../models/group.model.js';
import { EnrollmentModel } from '../../models/enrollment.model.js';
import { ProfessorModel } from '../../models/professor.model.js';
import { UserModel } from '../../models/user.model.js';
import { computeAcademicRecords, type AcademicRecord } from '../../shared/academic.service.js';
import { buscarPrograma } from '../../domains/catalog/uts.js';
import type { AlcanceDePrograma } from '../../domains/scope/program-scope.js';

/**
 * La vista de coordinación: qué se está dictando en mis carreras, quién lo
 * dicta y cómo va.
 *
 * Es una sola consulta por pantalla y no tres, a propósito. Materias, docentes
 * y grupos son **cortes distintos del mismo conjunto de datos** —las mismas
 * matrículas, las mismas notas—, y calcularlos por separado garantizaba que
 * tarde o temprano el promedio de una materia no coincidiera con el promedio
 * del docente que la dicta. Se arma una vez y se rebana.
 *
 * Aquí no se calcula ninguna nota: los promedios, la aprobación y el riesgo
 * salen de `computeAcademicRecords()`, que es la única pipeline académica.
 */

export type FiltroCoordinacion = {
  period?: string;
  /** Un solo programa. Solo estrecha: nunca saca del alcance. */
  programa?: string;
  q?: string;
};

export type MateriaDeCoordinacion = {
  subjectId: string;
  code: string;
  name: string;
  period: string;
  credits: number;
  programa: string | null;
  programaNombre: string;
  /** `true` cuando el programa se dedujo del docente por no estar en la materia. */
  programaDeducido: boolean;
  docente: { id: string; nombre: string; email: string } | null;
  grupos: number;
  estudiantes: number;
  promedio: number | null;
  aprobados: number;
  reprobados: number;
  sinNotas: number;
  enRiesgo: number;
  asistencia: number | null;
};

export type DocenteDeCoordinacion = {
  userId: string;
  profesorId: string | null;
  nombre: string;
  email: string;
  cedula: string | null;
  programas: string[];
  programasNombres: string[];
  esDirectorTrabajoGrado: boolean;
  materias: { id: string; code: string; name: string }[];
  grupos: number;
  estudiantes: number;
  promedio: number | null;
  enRiesgo: number;
};

export type GrupoDeCoordinacion = {
  groupId: string;
  name: string;
  period: string;
  materia: { id: string; code: string; name: string } | null;
  programaNombre: string;
  docente: { id: string; nombre: string } | null;
  estudiantes: number;
  promedio: number | null;
  enRiesgo: number;
};

export type ResumenDeCoordinacion = {
  programas: {
    id: string;
    nombre: string;
    materias: number;
    grupos: number;
    docentes: number;
    estudiantes: number;
    promedio: number | null;
    enRiesgo: number;
  }[];
  totales: {
    materias: number;
    grupos: number;
    docentes: number;
    estudiantes: number;
    promedio: number | null;
    enRiesgo: number;
    reprobando: number;
  };
};

export type Panorama = {
  periodo: string | null;
  programas: string[];
  alcanceTotal: boolean;
  materias: MateriaDeCoordinacion[];
  docentes: DocenteDeCoordinacion[];
  grupos: GrupoDeCoordinacion[];
  resumen: ResumenDeCoordinacion;
};

/** Media aritmética, o `null` cuando no hay nada que promediar. */
function media(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const suma = valores.reduce((total, valor) => total + valor, 0);
  return Math.round((suma / valores.length) * 100) / 100;
}

function nombrePrograma(id: string | null | undefined): string {
  if (!id) return 'Sin programa';
  return buscarPrograma(id)?.nombre ?? id;
}

/**
 * Programas que la consulta puede pedir.
 *
 * Un `?programa=` fuera del alcance no amplía nada: devuelve la lista vacía.
 * Es el mismo orden de siempre —lo que pide la URL primero, lo que el rol
 * impone después— y aquí importa igual: al revés, una coordinación de una
 * carrera vería la de al lado escribiendo su id en la barra de direcciones.
 */
function programasPedidos(filtro: FiltroCoordinacion, alcance: AlcanceDePrograma): string[] | null {
  if (alcance.total) return filtro.programa ? [filtro.programa] : null;
  if (!filtro.programa) return alcance.programas;
  return alcance.programas.includes(filtro.programa) ? [filtro.programa] : [];
}

export async function cargarPanorama(
  filtro: FiltroCoordinacion,
  alcance: AlcanceDePrograma,
): Promise<Panorama> {
  const programas = programasPedidos(filtro, alcance);

  // ── Materias del alcance ──────────────────────────────────────────────────
  const filtroMateria: Record<string, unknown> = { deletedAt: null };
  if (filtro.period) filtroMateria.period = filtro.period;
  if (!alcance.total) filtroMateria._id = { $in: alcance.subjectIds };
  if (programas && programas.length === 0) filtroMateria._id = { $in: [] };

  const materias = await SubjectModel.find(filtroMateria)
    .select('_id name code period credits programa professorId')
    .sort({ period: -1, code: 1 })
    .lean();

  // Fichas de los docentes implicados: hacen falta para el nombre visible y
  // para deducir el programa de las materias que no lo tienen escrito.
  const idsDocentes = [...new Set(materias.map(materia => String(materia.professorId)))];
  const [fichas, usuarios] = await Promise.all([
    ProfessorModel.find({ userId: { $in: idsDocentes }, deletedAt: null })
      .select('_id userId cedula programas esDirectorTrabajoGrado')
      .lean(),
    UserModel.find({ _id: { $in: idsDocentes }, deletedAt: null })
      .select('_id fullName email')
      .lean(),
  ]);

  const fichaPorUsuario = new Map(fichas.map(ficha => [String(ficha.userId), ficha]));
  const usuarioPorId = new Map(usuarios.map(usuario => [String(usuario._id), usuario]));

  /** Programa de una materia: el suyo, o el del docente cuando no lo tiene. */
  function programaDe(materia: (typeof materias)[number]): { id: string | null; deducido: boolean } {
    if (materia.programa) return { id: materia.programa, deducido: false };
    const delDocente = fichaPorUsuario.get(String(materia.professorId))?.programas ?? [];
    const candidato = programas
      ? delDocente.find(programa => programas.includes(programa))
      : delDocente[0];
    return { id: candidato ?? null, deducido: Boolean(candidato) };
  }

  // Con un programa pedido, las materias sin `programa` propio solo entran si
  // su docente está adscrito a él: si no, la lista de una carrera acabaría
  // mostrando las materias históricas de todas.
  const visibles = programas
    ? materias.filter(materia => {
        const programa = programaDe(materia).id;
        return programa != null && programas.includes(programa);
      })
    : materias;

  const filtradas = filtro.q
    ? visibles.filter(materia => {
        const termino = filtro.q!.toLowerCase();
        return (
          materia.name.toLowerCase().includes(termino) ||
          materia.code.toLowerCase().includes(termino) ||
          (usuarioPorId.get(String(materia.professorId))?.fullName ?? '')
            .toLowerCase()
            .includes(termino)
        );
      })
    : visibles;

  const subjectIds = filtradas.map(materia => String(materia._id));

  // ── Grupos, matrículas y expediente ───────────────────────────────────────
  const [grupos, matriculas, expediente] = await Promise.all([
    GroupModel.find({ subjectId: { $in: subjectIds }, deletedAt: null })
      .select('_id name subjectId professorId period')
      .lean(),
    EnrollmentModel.find({
      subjectId: { $in: subjectIds },
      deletedAt: null,
      enrollmentStatus: 'ACTIVE',
      ...(filtro.period ? { period: filtro.period } : {}),
    })
      .select('studentId subjectId groupId')
      .lean(),
    computeAcademicRecords({ subjectIds, period: filtro.period }),
  ]);

  const porMateria = new Map<string, AcademicRecord[]>();
  const porGrupo = new Map<string, AcademicRecord[]>();
  for (const registro of expediente) {
    const materia = String(registro.subjectId);
    if (!porMateria.has(materia)) porMateria.set(materia, []);
    porMateria.get(materia)!.push(registro);
    if (registro.groupId) {
      const grupo = String(registro.groupId);
      if (!porGrupo.has(grupo)) porGrupo.set(grupo, []);
      porGrupo.get(grupo)!.push(registro);
    }
  }

  const gruposPorMateria = new Map<string, typeof grupos>();
  for (const grupo of grupos) {
    const materia = String(grupo.subjectId);
    if (!gruposPorMateria.has(materia)) gruposPorMateria.set(materia, []);
    gruposPorMateria.get(materia)!.push(grupo);
  }

  const estudiantesPorMateria = new Map<string, Set<string>>();
  const estudiantesPorGrupo = new Map<string, Set<string>>();
  for (const matricula of matriculas) {
    const materia = String(matricula.subjectId);
    if (!estudiantesPorMateria.has(materia)) estudiantesPorMateria.set(materia, new Set());
    estudiantesPorMateria.get(materia)!.add(String(matricula.studentId));
    const grupo = String(matricula.groupId);
    if (!estudiantesPorGrupo.has(grupo)) estudiantesPorGrupo.set(grupo, new Set());
    estudiantesPorGrupo.get(grupo)!.add(String(matricula.studentId));
  }

  /** Cifras académicas de un conjunto de registros. */
  function cifras(registros: AcademicRecord[]) {
    const conNotas = registros.filter(registro => registro.tieneNotas);
    return {
      promedio: media(conNotas.map(registro => registro.notaFinal)),
      aprobados: conNotas.filter(registro => registro.aprobado).length,
      reprobados: conNotas.filter(registro => !registro.aprobado).length,
      sinNotas: registros.length - conNotas.length,
      enRiesgo: registros.filter(registro => registro.riesgo.nivel !== 'BAJO').length,
      asistencia: media(registros.map(registro => registro.riesgo.porcentajeAsistencia)),
    };
  }

  // ── Materias ──────────────────────────────────────────────────────────────
  const itemsMateria: MateriaDeCoordinacion[] = filtradas.map(materia => {
    const id = String(materia._id);
    const programa = programaDe(materia);
    const usuario = usuarioPorId.get(String(materia.professorId));
    const resumen = cifras(porMateria.get(id) ?? []);
    return {
      subjectId: id,
      code: materia.code,
      name: materia.name,
      period: materia.period,
      credits: materia.credits ?? 0,
      programa: programa.id,
      programaNombre: nombrePrograma(programa.id),
      programaDeducido: programa.deducido,
      docente: usuario
        ? { id: String(usuario._id), nombre: usuario.fullName, email: usuario.email }
        : null,
      grupos: (gruposPorMateria.get(id) ?? []).length,
      estudiantes: (estudiantesPorMateria.get(id) ?? new Set()).size,
      ...resumen,
    };
  });

  // ── Docentes ──────────────────────────────────────────────────────────────
  const materiasPorDocente = new Map<string, MateriaDeCoordinacion[]>();
  for (const materia of itemsMateria) {
    if (!materia.docente) continue;
    const clave = materia.docente.id;
    if (!materiasPorDocente.has(clave)) materiasPorDocente.set(clave, []);
    materiasPorDocente.get(clave)!.push(materia);
  }

  const itemsDocente: DocenteDeCoordinacion[] = [...materiasPorDocente.entries()]
    .map(([userId, suyas]) => {
      const usuario = usuarioPorId.get(userId);
      const ficha = fichaPorUsuario.get(userId);
      const registros = suyas.flatMap(materia => porMateria.get(materia.subjectId) ?? []);
      const resumen = cifras(registros);
      const estudiantes = new Set(registros.map(registro => String(registro.studentId)));
      return {
        userId,
        profesorId: ficha ? String(ficha._id) : null,
        nombre: usuario?.fullName ?? 'Sin nombre',
        email: usuario?.email ?? '',
        cedula: ficha?.cedula ?? null,
        programas: ficha?.programas ?? [],
        programasNombres: (ficha?.programas ?? []).map(nombrePrograma),
        esDirectorTrabajoGrado: Boolean(ficha?.esDirectorTrabajoGrado),
        materias: suyas.map(materia => ({
          id: materia.subjectId,
          code: materia.code,
          name: materia.name,
        })),
        grupos: suyas.reduce((total, materia) => total + materia.grupos, 0),
        estudiantes: estudiantes.size,
        promedio: resumen.promedio,
        enRiesgo: resumen.enRiesgo,
      };
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre));

  // ── Grupos ────────────────────────────────────────────────────────────────
  const materiaPorId = new Map(itemsMateria.map(materia => [materia.subjectId, materia]));
  const itemsGrupo: GrupoDeCoordinacion[] = grupos
    .filter(grupo => materiaPorId.has(String(grupo.subjectId)))
    .map(grupo => {
      const id = String(grupo._id);
      const materia = materiaPorId.get(String(grupo.subjectId))!;
      const usuario = usuarioPorId.get(String(grupo.professorId));
      const resumen = cifras(porGrupo.get(id) ?? []);
      return {
        groupId: id,
        name: grupo.name,
        period: grupo.period,
        materia: { id: materia.subjectId, code: materia.code, name: materia.name },
        programaNombre: materia.programaNombre,
        docente: usuario ? { id: String(usuario._id), nombre: usuario.fullName } : null,
        estudiantes: (estudiantesPorGrupo.get(id) ?? new Set()).size,
        promedio: resumen.promedio,
        enRiesgo: resumen.enRiesgo,
      };
    })
    .sort(
      (a, b) =>
        (a.materia?.code ?? '').localeCompare(b.materia?.code ?? '') ||
        a.name.localeCompare(b.name),
    );

  // ── Resumen por programa ──────────────────────────────────────────────────
  const porPrograma = new Map<string, MateriaDeCoordinacion[]>();
  for (const materia of itemsMateria) {
    const clave = materia.programa ?? '';
    if (!porPrograma.has(clave)) porPrograma.set(clave, []);
    porPrograma.get(clave)!.push(materia);
  }

  const resumenProgramas = [...porPrograma.entries()]
    .map(([id, suyas]) => {
      const registros = suyas.flatMap(materia => porMateria.get(materia.subjectId) ?? []);
      const resumen = cifras(registros);
      return {
        id,
        nombre: nombrePrograma(id || null),
        materias: suyas.length,
        grupos: suyas.reduce((total, materia) => total + materia.grupos, 0),
        docentes: new Set(suyas.map(materia => materia.docente?.id).filter(Boolean)).size,
        estudiantes: new Set(registros.map(registro => String(registro.studentId))).size,
        promedio: resumen.promedio,
        enRiesgo: resumen.enRiesgo,
      };
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre));

  const global = cifras(
    expediente.filter(registro => materiaPorId.has(String(registro.subjectId))),
  );

  return {
    periodo: filtro.period ?? null,
    programas: programas ?? [],
    alcanceTotal: alcance.total,
    materias: itemsMateria,
    docentes: itemsDocente,
    grupos: itemsGrupo,
    resumen: {
      programas: resumenProgramas,
      totales: {
        materias: itemsMateria.length,
        grupos: itemsGrupo.length,
        docentes: itemsDocente.length,
        estudiantes: new Set(matriculas.map(matricula => String(matricula.studentId))).size,
        promedio: global.promedio,
        enRiesgo: global.enRiesgo,
        reprobando: global.reprobados,
      },
    },
  };
}
