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
import { RUBRICA } from '../../domains/grading/grading.service.js';
import { ASISTENCIA } from '../../domains/attendance/attendance.service.js';
import type { Tono } from './report-layout.js';

export type MapBundle = {
  subjects: Map<string, any>;
  students: Map<string, any>;
  groups: Map<string, any>;
};

export type ColumnaReporte<T = any> = {
  key: string;
  header: string;
  /**
   * Ancho **natural** en puntos para la tabla del PDF: el que necesita la
   * columna para que su contenido habitual quepa sin partirse. El renderer lo
   * usa como proporción para repartir la página entera (`ajustarAnchos`), y la
   * suma decide si el documento va en horizontal (`orientacionPara`).
   */
  pdfWidth: number;
  /** Ancho mínimo en caracteres para la hoja de Excel; crece con el contenido. */
  excelWidth: number;
  /** Alineación en PDF y Excel. Las cifras van a la derecha o centradas. */
  align?: 'left' | 'center' | 'right';
  /** Decimales fijos de una celda numérica, en el PDF y en el formato de Excel. */
  decimales?: number;
  /** Significado de una celda (aprobado, reprobado, ausente); el color lo pone el renderer. */
  tono?: (valor: string | number) => Tono | null;
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

const COMPONENTES: Record<string, string> = {
  TRABAJOS: 'Trabajos',
  PARCIALES: 'Parciales',
  AUTOEVALUACION: 'Autoevaluación',
};

/** Una nota por debajo de la de aprobación se marca; el umbral es el de la rúbrica. */
const tonoDeNota = (valor: string | number): Tono | null =>
  Number(valor) < RUBRICA.NOTA_APROBACION ? 'mal' : null;

/** Umbrales del dominio de asistencia, no unos propios del reporte. */
const tonoDeAsistencia = (valor: string | number): Tono | null => {
  const porcentaje = parseFloat(String(valor));
  if (!Number.isFinite(porcentaje)) return null;
  if (porcentaje < ASISTENCIA.UMBRAL_CRITICO) return 'mal';
  if (porcentaje < ASISTENCIA.UMBRAL_MINIMO) return 'alerta';
  return null;
};

/**
 * Asistencia. Incluye `minutos` (`durationMinutes`): el dominio pondera la
 * asistencia por minutos, así que un acta que solo diga Sí/No no permite
 * reconstruir el porcentaje que muestra el dashboard.
 */
export const COLUMNAS_ATTENDANCE: ColumnaReporte[] = [
  { key: 'code', header: 'Documento', pdfWidth: 68, excelWidth: 14, value: (r, m) => estudiante(r, m)?.code ?? '' },
  { key: 'student', header: 'Estudiante', pdfWidth: 150, excelWidth: 30, value: (r, m) => estudiante(r, m)?.fullName ?? '' },
  { key: 'group', header: 'Grupo', pdfWidth: 50, excelWidth: 10, value: (r, m) => grupo(r, m)?.name ?? '' },
  { key: 'subject', header: 'Materia', pdfWidth: 150, excelWidth: 30, value: (r, m) => `${materia(r, m)?.code ?? ''} ${materia(r, m)?.name ?? ''}`.trim() },
  { key: 'date', header: 'Fecha', pdfWidth: 60, excelWidth: 12, align: 'center', value: r => fecha(r.date) },
  { key: 'minutes', header: 'Min.', pdfWidth: 36, excelWidth: 8, align: 'right', decimales: 0, value: r => Number(r.durationMinutes ?? 90) },
  {
    key: 'present',
    header: 'Presente',
    pdfWidth: 54,
    excelWidth: 10,
    align: 'center',
    tono: valor => (valor === 'No' ? 'mal' : null),
    value: r => (r.present ? 'Sí' : 'No'),
  },
  { key: 'notes', header: 'Observación', pdfWidth: 146, excelWidth: 30, value: r => r.notes ?? '' },
  { key: 'period', header: 'Semestre', pdfWidth: 52, excelWidth: 10, align: 'center', value: r => r.period ?? '' },
];

/** Notas atómicas (una fila por nota capturada). */
export const COLUMNAS_GRADES: ColumnaReporte[] = [
  { key: 'code', header: 'Documento', pdfWidth: 68, excelWidth: 14, value: (r, m) => estudiante(r, m)?.code ?? '' },
  { key: 'student', header: 'Estudiante', pdfWidth: 160, excelWidth: 30, value: (r, m) => estudiante(r, m)?.fullName ?? '' },
  { key: 'group', header: 'Grupo', pdfWidth: 50, excelWidth: 10, value: (r, m) => grupo(r, m)?.name ?? '' },
  { key: 'subject', header: 'Materia', pdfWidth: 160, excelWidth: 30, value: (r, m) => `${materia(r, m)?.code ?? ''} ${materia(r, m)?.name ?? ''}`.trim() },
  {
    key: 'component',
    header: 'Componente',
    pdfWidth: 150,
    excelWidth: 26,
    // «C2 · Parciales · Parcial teórico». La etiqueta es lo que distingue dos
    // notas del mismo componente; «Nota» es el valor por defecto y no dice nada.
    value: r => {
      if (!r.corte) return String(r.component ?? '');
      const tipo = COMPONENTES[String(r.componentType ?? '')] ?? String(r.componentType ?? '');
      const etiqueta = typeof r.label === 'string' && r.label.trim() !== 'Nota' ? r.label.trim() : '';
      return [`C${r.corte}`, tipo, etiqueta].filter(Boolean).join(' · ');
    },
  },
  { key: 'score', header: 'Nota', pdfWidth: 42, excelWidth: 8, align: 'right', decimales: 2, tono: tonoDeNota, value: r => Number(r.score ?? 0) },
  { key: 'period', header: 'Semestre', pdfWidth: 52, excelWidth: 10, align: 'center', value: r => r.period ?? '' },
];

/**
 * Nota de un corte en su propia columna. En una sola («C1:3.2 C2:4.1 C3:0.0»)
 * era un texto que el PDF cortaba y que en Excel no se podía sumar ni ordenar.
 */
const corte = (indice: number): ColumnaReporte<AcademicRecord> => ({
  key: `c${indice + 1}`,
  header: `C${indice + 1}`,
  pdfWidth: 38,
  excelWidth: 7,
  align: 'right',
  decimales: 1,
  value: r => Number((r.cortes[indice] ?? 0).toFixed(2)),
});

/** Consolidado de nota final (una fila por AcademicRecord con notas). */
export const COLUMNAS_CONSOLIDADO: ColumnaReporte<AcademicRecord>[] = [
  { key: 'code', header: 'Documento', pdfWidth: 68, excelWidth: 14, value: r => r.code },
  { key: 'student', header: 'Estudiante', pdfWidth: 170, excelWidth: 30, value: r => r.fullName },
  { key: 'subject', header: 'Materia', pdfWidth: 160, excelWidth: 30, value: (r, m) => m.subjects.get(String(r.subjectId))?.name ?? '' },
  corte(0),
  corte(1),
  corte(2),
  { key: 'final', header: 'Final', pdfWidth: 44, excelWidth: 8, align: 'right', decimales: 2, tono: tonoDeNota, value: r => Number(r.notaFinal.toFixed(2)) },
  {
    key: 'estado',
    header: 'Estado',
    pdfWidth: 66,
    excelWidth: 12,
    align: 'center',
    tono: valor => (valor === 'Aprobado' ? 'ok' : valor === 'Reprobado' ? 'mal' : null),
    value: r => (r.aprobado ? 'Aprobado' : 'Reprobado'),
  },
  { key: 'attendance', header: 'Asistencia', pdfWidth: 58, excelWidth: 11, align: 'right', tono: tonoDeAsistencia, value: r => `${r.riesgo.porcentajeAsistencia.toFixed(0)}%` },
  { key: 'period', header: 'Semestre', pdfWidth: 52, excelWidth: 10, align: 'center', value: r => r.period },
];

/**
 * Columnas que ya no existen y por cuáles se cambian. Una plantilla guardada
 * antes de separar los cortes nombra `cortes`; sin esto la columna
 * desaparecería del acta sin que nadie la hubiera quitado.
 */
export const COLUMNAS_SUSTITUIDAS: Record<string, string[]> = {
  cortes: ['c1', 'c2', 'c3'],
};

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

/**
 * Filas solo-texto para el PDF y la vista previa. Las cifras salen con sus
 * decimales fijos: una columna con «3.5», «4.25» y «4» no se lee como una
 * columna de notas.
 */
export function construirFilasTexto<T>(columnas: ColumnaReporte<T>[], items: T[], maps: MapBundle): string[][] {
  return construirFilas(columnas, items, maps).map(fila =>
    fila.map((celda, i) => {
      const decimales = columnas[i]?.decimales;
      return typeof celda === 'number' && decimales != null ? celda.toFixed(decimales) : String(celda);
    }),
  );
}
