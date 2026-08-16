/**
 * Catálogo declarativo de columnas por tipo de reporte.
 *
 * Es la ÚNICA fuente de filas para PDF, Excel y vista previa: los tres
 * consumen el mismo catálogo, así que no pueden divergir entre sí. Antes
 * cada endpoint armaba sus filas a mano y el PDF, el Excel y (ahora) la
 * vista previa podían mostrar cosas distintas con los mismos filtros.
 *
 * Funciones puras: reciben el documento y los mapas ya resueltos, no tocan
 * la base. Eso las hace testeables en `backend/tests/report-columns.test.ts`.
 */
import type { AcademicRecord } from '../../shared/academic.service.js';

export type MapBundle = {
  subjects: Map<string, any>;
  students: Map<string, any>;
  groups: Map<string, any>;
};

export type ColumnaReporte<T = any> = {
  key: string;
  header: string;
  /** Ancho en puntos para la tabla del PDF. */
  pdfWidth: number;
  /** Ancho en caracteres para la hoja de Excel. */
  excelWidth: number;
  value: (item: T, maps: MapBundle) => string | number;
};

function fecha(value: unknown): string {
  const date = new Date(value as any);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

const estudiante = (item: any, maps: MapBundle) => maps.students.get(String(item.studentId));
const materia = (item: any, maps: MapBundle) => maps.subjects.get(String(item.subjectId));
const grupo = (item: any, maps: MapBundle) => maps.groups.get(String(item.groupId ?? ''));

/**
 * Asistencia. Incluye `minutos` (`durationMinutes`): el dominio pondera la
 * asistencia por minutos, así que un acta que solo diga Sí/No no permite
 * reconstruir el porcentaje que muestra el dashboard.
 */
export const COLUMNAS_ATTENDANCE: ColumnaReporte[] = [
  { key: 'code', header: 'Cedula', pdfWidth: 48, excelWidth: 16, value: (r, m) => estudiante(r, m)?.code ?? '' },
  { key: 'student', header: 'Estudiante', pdfWidth: 84, excelWidth: 28, value: (r, m) => estudiante(r, m)?.fullName ?? '' },
  { key: 'group', header: 'Grupo', pdfWidth: 44, excelWidth: 18, value: (r, m) => grupo(r, m)?.name ?? '' },
  { key: 'subject', header: 'Materia', pdfWidth: 78, excelWidth: 28, value: (r, m) => `${materia(r, m)?.code ?? ''} ${materia(r, m)?.name ?? ''}`.trim() },
  { key: 'date', header: 'Fecha', pdfWidth: 56, excelWidth: 14, value: r => fecha(r.date) },
  { key: 'minutes', header: 'Min.', pdfWidth: 30, excelWidth: 8, value: r => Number(r.durationMinutes ?? 90) },
  { key: 'present', header: 'Presente', pdfWidth: 44, excelWidth: 10, value: r => (r.present ? 'Si' : 'No') },
  { key: 'notes', header: 'Observacion', pdfWidth: 72, excelWidth: 26, value: r => r.notes ?? '' },
  { key: 'period', header: 'Semestre', pdfWidth: 44, excelWidth: 12, value: r => r.period ?? '' },
];

/** Notas atómicas (una fila por componente calificado). */
export const COLUMNAS_GRADES: ColumnaReporte[] = [
  { key: 'code', header: 'Cedula', pdfWidth: 48, excelWidth: 16, value: (r, m) => estudiante(r, m)?.code ?? '' },
  { key: 'student', header: 'Estudiante', pdfWidth: 88, excelWidth: 28, value: (r, m) => estudiante(r, m)?.fullName ?? '' },
  { key: 'group', header: 'Grupo', pdfWidth: 44, excelWidth: 18, value: (r, m) => grupo(r, m)?.name ?? '' },
  { key: 'subject', header: 'Materia', pdfWidth: 96, excelWidth: 28, value: (r, m) => `${materia(r, m)?.code ?? ''} ${materia(r, m)?.name ?? ''}`.trim() },
  {
    key: 'component',
    header: 'Componente',
    pdfWidth: 74,
    excelWidth: 18,
    value: r => (r.corte ? `C${r.corte} ${r.componentType ?? ''}`.trim() : String(r.component ?? '')),
  },
  { key: 'score', header: 'Nota', pdfWidth: 36, excelWidth: 10, value: r => Number(r.score ?? 0) },
  { key: 'period', header: 'Semestre', pdfWidth: 44, excelWidth: 12, value: r => r.period ?? '' },
];

/** Consolidado de nota final (una fila por AcademicRecord con notas). */
export const COLUMNAS_CONSOLIDADO: ColumnaReporte<AcademicRecord>[] = [
  { key: 'code', header: 'Cedula', pdfWidth: 52, excelWidth: 16, value: r => r.code },
  { key: 'student', header: 'Estudiante', pdfWidth: 100, excelWidth: 28, value: r => r.fullName },
  { key: 'subject', header: 'Materia', pdfWidth: 92, excelWidth: 28, value: (r, m) => m.subjects.get(String(r.subjectId))?.name ?? '' },
  { key: 'cortes', header: 'Cortes', pdfWidth: 88, excelWidth: 20, value: r => r.cortes.map((n, i) => `C${i + 1}:${n.toFixed(1)}`).join(' ') },
  { key: 'final', header: 'Final', pdfWidth: 40, excelWidth: 12, value: r => Number(r.notaFinal.toFixed(2)) },
  { key: 'estado', header: 'Estado', pdfWidth: 58, excelWidth: 12, value: r => (r.aprobado ? 'Aprobado' : 'Reprobado') },
  { key: 'attendance', header: 'Asist.', pdfWidth: 40, excelWidth: 12, value: r => `${r.riesgo.porcentajeAsistencia.toFixed(0)}%` },
  { key: 'period', header: 'Semestre', pdfWidth: 44, excelWidth: 12, value: r => r.period },
];

export const CATALOGOS = {
  attendance: COLUMNAS_ATTENDANCE,
  grades: COLUMNAS_GRADES,
  consolidado: COLUMNAS_CONSOLIDADO,
} as const;

export type TipoCatalogo = keyof typeof CATALOGOS;

/** Filas crudas (número o texto). El Excel las quiere tipadas; el PDF las convierte. */
export function construirFilas<T>(columnas: ColumnaReporte<T>[], items: T[], maps: MapBundle): (string | number)[][] {
  return items.map(item => columnas.map(col => col.value(item, maps)));
}

/** Filas solo-texto para el PDF y la vista previa. */
export function construirFilasTexto<T>(columnas: ColumnaReporte<T>[], items: T[], maps: MapBundle): string[][] {
  return construirFilas(columnas, items, maps).map(fila => fila.map(celda => String(celda)));
}
