import { StudentModel } from '../../models/student.model.js';
import { GradeModel } from '../../models/grade.model.js';
import { AttendanceModel } from '../../models/attendance.model.js';
import { SubjectModel } from '../../models/subject.model.js';
import { GroupModel } from '../../models/group.model.js';
import { computeAcademicRecords, type AcademicRecord } from '../../shared/academic.service.js';
import type { MapBundle } from './report-columns.js';

/**
 * Acceso a datos de los reportes.
 *
 * Aquí están los cinco modelos que antes importaba el archivo de rutas. La
 * regla es que **un `.routes.ts` no toca un Modelo**: si la ruta necesita
 * datos, se los pide a su servicio. No es orden por el orden — es lo que
 * permite probar el alcance y los filtros sin levantar Mongo, y lo que evita
 * que el archivo de rutas siga creciendo hasta contener el proyecto entero.
 */

export type ReportFilters = {
  period?: string;
  subjectId?: string;
  studentId?: string;
  groupId?: string;
  teacherId?: string;
  dateFrom?: Date | null;
  dateTo?: Date | null;
};

export type Solicitante = { id: string; role: string } | undefined;

/**
 * Filtros de la petición, ya acotados al rol.
 *
 * **Un docente nunca sale de lo suyo:** si el rol es PROFESSOR se fuerza su
 * `teacherId` aunque la petición traiga otro. Quitar esa línea no rompe nada
 * visible — simplemente deja que cualquiera descargue el acta de otro pasando
 * su id en la URL.
 */
export function filtrosDeConsulta(query: any, user?: Solicitante): ReportFilters {
  const filters: ReportFilters = {};
  if (query.period) filters.period = String(query.period);
  if (query.subjectId) filters.subjectId = String(query.subjectId);
  if (query.studentId) filters.studentId = String(query.studentId);
  if (query.groupId) filters.groupId = String(query.groupId);
  if (query.teacherId) filters.teacherId = String(query.teacherId);
  if (query.dateFrom) filters.dateFrom = new Date(String(query.dateFrom));
  if (query.dateTo) filters.dateTo = new Date(String(query.dateTo));
  if (user?.role === 'PROFESSOR') filters.teacherId = user.id;
  return filters;
}

/** Filtro de Nota. */
export function filtroDeNotas(filters: ReportFilters): Record<string, unknown> {
  const query: Record<string, unknown> = { deletedAt: null };
  if (filters.period) query.period = filters.period;
  if (filters.subjectId) query.subjectId = filters.subjectId;
  if (filters.studentId) query.studentId = filters.studentId;
  if (filters.groupId) query.groupId = filters.groupId;
  if (filters.teacherId) query.teacherId = filters.teacherId;
  return query;
}

/** Filtro de Asistencia, con el rango de fechas del reporte. */
export function filtroDeAsistencia(filters: ReportFilters): Record<string, unknown> {
  const query = filtroDeNotas(filters);
  if (filters.dateFrom || filters.dateTo) {
    const rango: Record<string, unknown> = {};
    if (filters.dateFrom) rango.$gte = filters.dateFrom;
    if (filters.dateTo) rango.$lte = filters.dateTo;
    query.date = rango;
  }
  return query;
}

/** Filtro académico (nota final consolidada) según rol. */
export function filtroAcademico(query: any, user?: Solicitante) {
  const filter: { teacherId?: string; studentId?: string; period?: string } = {};
  if (query.period) filter.period = String(query.period);
  if (query.studentId) filter.studentId = String(query.studentId);
  if (user?.role === 'PROFESSOR') filter.teacherId = user.id;
  else if (query.teacherId) filter.teacherId = String(query.teacherId);
  return filter;
}

// ── Consultas ───────────────────────────────────────────────────────────────

export function buscarNotas(filters: ReportFilters, orden: Record<string, 1 | -1> = { studentId: 1 }) {
  return GradeModel.find(filtroDeNotas(filters)).sort(orden).lean();
}

const ORDEN_COMPONENTE: Record<string, number> = { TRABAJOS: 0, PARCIALES: 1, AUTOEVALUACION: 2 };

/**
 * Notas en el orden en que se leen en un acta: estudiante (alfabético),
 * materia, corte 1→3 y componente en el orden de la rúbrica (30/60/10).
 *
 * Ordenar en Mongo por `studentId` agrupa por estudiante pero en el orden del
 * ObjectId —es decir, por fecha de creación del registro—, así que el listado
 * salía con los estudiantes barajados. El nombre vive en el diccionario, no en
 * la fila, por eso se ordena aquí y después de resolver los mapas.
 */
export function ordenarNotasParaActa<T extends { studentId?: unknown; subjectId?: unknown; corte?: unknown; componentType?: unknown }>(
  grades: T[],
  maps: MapBundle,
): T[] {
  const nombre = (fila: T) => maps.students.get(String(fila.studentId))?.fullName ?? '';
  const materia = (fila: T) => maps.subjects.get(String(fila.subjectId))?.name ?? '';
  return [...grades].sort(
    (a, b) =>
      nombre(a).localeCompare(nombre(b)) ||
      materia(a).localeCompare(materia(b)) ||
      Number(a.corte ?? 0) - Number(b.corte ?? 0) ||
      (ORDEN_COMPONENTE[String(a.componentType ?? '')] ?? 9) -
        (ORDEN_COMPONENTE[String(b.componentType ?? '')] ?? 9),
  );
}

export function buscarAsistencia(filters: ReportFilters, orden: Record<string, 1 | -1> = { date: -1 }) {
  return AttendanceModel.find(filtroDeAsistencia(filters)).sort(orden).lean();
}

/** Registros consolidados con notas, ordenados como salen en el acta. */
export async function consolidadoOrdenado(query: any, user?: Solicitante): Promise<AcademicRecord[]> {
  const records = await computeAcademicRecords(filtroAcademico(query, user));
  return records.filter(r => r.tieneNotas).sort((a, b) => a.fullName.localeCompare(b.fullName));
}

/** Cifras de portada del panel de reportes. */
export async function resumenGeneral() {
  const [students, averageGrade, averageAttendance] = await Promise.all([
    StudentModel.countDocuments({ deletedAt: null }),
    GradeModel.aggregate([{ $match: { deletedAt: null } }, { $group: { _id: null, avg: { $avg: '$score' } } }]),
    AttendanceModel.aggregate([
      { $match: { deletedAt: null } },
      { $group: { _id: null, avg: { $avg: { $cond: ['$present', 1, 0] } } } },
    ]),
  ]);
  return {
    students,
    averageGrade: averageGrade[0]?.avg ?? 0,
    averageAttendance: Number(((averageAttendance[0]?.avg ?? 0) * 100).toFixed(2)),
  };
}

/** Fila de la que el catálogo de columnas saca nombres. */
type FilaConReferencias = {
  studentId?: unknown;
  subjectId?: unknown;
  groupId?: unknown;
};

/**
 * Diccionarios de nombres para las filas de **este** reporte.
 *
 * Antes esta función no recibía nada y traía las tres colecciones enteras a
 * memoria en cada llamada: cada estudiante, cada materia y cada grupo de la
 * institución, para un PDF de un grupo de treinta. Un reporte filtrado por una
 * sola materia cargaba lo mismo que el consolidado general, y con el padrón
 * completo eso es el techo de memoria del proceso — con la particularidad de
 * que la ruta que más lo llama, la vista previa, se dispara sola al abrir la
 * pantalla de reportes.
 *
 * Ahora se piden solo los identificadores que aparecen en las filas. Sin
 * ninguno no consulta nada: un reporte vacío no necesita diccionario.
 */
export async function resolveMaps(...listas: FilaConReferencias[][]): Promise<MapBundle> {
  const studentIds = new Set<string>();
  const subjectIds = new Set<string>();
  const groupIds = new Set<string>();

  for (const lista of listas) {
    for (const fila of lista) {
      if (fila.studentId) studentIds.add(String(fila.studentId));
      if (fila.subjectId) subjectIds.add(String(fila.subjectId));
      if (fila.groupId) groupIds.add(String(fila.groupId));
    }
  }

  const [subjects, students, groups] = await Promise.all([
    subjectIds.size ? SubjectModel.find({ _id: { $in: [...subjectIds] }, deletedAt: null }).lean() : [],
    studentIds.size ? StudentModel.find({ _id: { $in: [...studentIds] }, deletedAt: null }).lean() : [],
    groupIds.size ? GroupModel.find({ _id: { $in: [...groupIds] }, deletedAt: null }).lean() : [],
  ]);

  return {
    subjects: new Map(subjects.map(item => [String(item._id), item])),
    students: new Map(students.map(item => [String(item._id), item])),
    groups: new Map(groups.map(item => [String(item._id), item])),
  };
}
