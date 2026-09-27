import ExcelJS from 'exceljs';
import { agregarFila, cerrarHoja, enviarExcel, prepararHoja, type ColumnaHoja } from '../reports/excel.renderer.js';
import type { Plantilla } from '../reports/report-template.js';
import type { Tono } from '../reports/report-layout.js';
import type { Dato } from '../reports/report-summary.js';
import { RUBRICA } from '../../domains/grading/grading.service.js';
import type { Panorama } from './coordination.service.js';

/**
 * Exportables de coordinación.
 *
 * Un libro con tres hojas —materias, docentes y grupos— y no tres descargas
 * distintas: quien exporta esto lo está preparando para una reunión, y tres
 * archivos sueltos se convierten en tres versiones que ya no coinciden en
 * cuanto alguien exporta una de ellas al día siguiente.
 *
 * Cada hoja lleva el mismo membrete que los reportes (`prepararHoja`): es un
 * documento que se imprime y se lleva a comité, no una tabla suelta.
 *
 * Vive aparte de las rutas por lo mismo que el resto de renderers del
 * proyecto: cambiar el ancho de una columna no debería obligar a abrir el
 * archivo donde se decide quién puede descargarla.
 */

/** `null` en una celda de nota se escribe vacío, nunca 0: no son lo mismo. */
function nota(valor: number | null): number | string {
  return valor == null ? '' : valor;
}

const tonoDePromedio = (valor: string | number): Tono | null =>
  typeof valor === 'number' && valor < RUBRICA.NOTA_APROBACION ? 'mal' : null;

const tonoDeConteo = (tono: Tono) => (valor: string | number): Tono | null =>
  typeof valor === 'number' && valor > 0 ? tono : null;

const COLUMNAS_MATERIAS: ColumnaHoja[] = [
  { header: 'Código', key: 'code', excelWidth: 12 },
  { header: 'Materia', key: 'name', excelWidth: 30 },
  { header: 'Programa', key: 'programa', excelWidth: 32 },
  { header: 'Periodo', key: 'period', excelWidth: 10, align: 'center' },
  { header: 'Docente', key: 'docente', excelWidth: 26 },
  { header: 'Correo', key: 'correo', excelWidth: 26 },
  { header: 'Grupos', key: 'grupos', excelWidth: 8, align: 'right', decimales: 0 },
  { header: 'Estudiantes', key: 'estudiantes', excelWidth: 11, align: 'right', decimales: 0 },
  { header: 'Promedio', key: 'promedio', excelWidth: 10, align: 'right', decimales: 2, tono: tonoDePromedio },
  { header: 'Aprobados', key: 'aprobados', excelWidth: 10, align: 'right', decimales: 0 },
  { header: 'Reprobados', key: 'reprobados', excelWidth: 11, align: 'right', decimales: 0, tono: tonoDeConteo('mal') },
  { header: 'Sin notas', key: 'sinNotas', excelWidth: 10, align: 'right', decimales: 0 },
  { header: 'En riesgo', key: 'enRiesgo', excelWidth: 10, align: 'right', decimales: 0, tono: tonoDeConteo('alerta') },
  { header: 'Asistencia %', key: 'asistencia', excelWidth: 12, align: 'right', decimales: 1 },
];

const COLUMNAS_DOCENTES: ColumnaHoja[] = [
  { header: 'Docente', key: 'nombre', excelWidth: 26 },
  { header: 'Cédula', key: 'cedula', excelWidth: 14 },
  { header: 'Correo', key: 'correo', excelWidth: 26 },
  { header: 'Programas', key: 'programas', excelWidth: 36 },
  { header: 'Materias', key: 'materias', excelWidth: 40 },
  { header: 'N.º materias', key: 'total', excelWidth: 11, align: 'right', decimales: 0 },
  { header: 'Grupos', key: 'grupos', excelWidth: 8, align: 'right', decimales: 0 },
  { header: 'Estudiantes', key: 'estudiantes', excelWidth: 11, align: 'right', decimales: 0 },
  { header: 'Promedio', key: 'promedio', excelWidth: 10, align: 'right', decimales: 2, tono: tonoDePromedio },
  { header: 'En riesgo', key: 'enRiesgo', excelWidth: 10, align: 'right', decimales: 0, tono: tonoDeConteo('alerta') },
  { header: 'Dirige trabajos de grado', key: 'director', excelWidth: 14, align: 'center' },
];

const COLUMNAS_GRUPOS: ColumnaHoja[] = [
  { header: 'Grupo', key: 'name', excelWidth: 10 },
  { header: 'Materia', key: 'materia', excelWidth: 34 },
  { header: 'Programa', key: 'programa', excelWidth: 32 },
  { header: 'Periodo', key: 'period', excelWidth: 10, align: 'center' },
  { header: 'Docente', key: 'docente', excelWidth: 26 },
  { header: 'Estudiantes', key: 'estudiantes', excelWidth: 11, align: 'right', decimales: 0 },
  { header: 'Promedio', key: 'promedio', excelWidth: 10, align: 'right', decimales: 2, tono: tonoDePromedio },
  { header: 'En riesgo', key: 'enRiesgo', excelWidth: 10, align: 'right', decimales: 0, tono: tonoDeConteo('alerta') },
];

export type MembretePanorama = {
  plantilla: Plantilla;
  /** Ficha común a las tres hojas: periodo, programa, fecha de generación. */
  detalles: Dato[];
};

function hoja(
  wb: ExcelJS.Workbook,
  nombre: string,
  columnas: ColumnaHoja[],
  filas: Record<string, unknown>[],
  membrete: MembretePanorama,
) {
  const ws = wb.addWorksheet(nombre);
  const encabezado = prepararHoja(wb, ws, columnas, {
    titulo: `Panorama de coordinación · ${nombre}`,
    plantilla: membrete.plantilla,
    detalles: membrete.detalles,
  });
  filas.forEach(fila => agregarFila(ws, fila));
  cerrarHoja(ws, encabezado, columnas, membrete.plantilla);
}

export async function enviarPanoramaExcel(
  res: { setHeader(name: string, value: string): void; send(body: Buffer): void },
  panorama: Panorama,
  filename: string,
  membrete: MembretePanorama,
) {
  const wb = new ExcelJS.Workbook();

  hoja(wb, 'Materias', COLUMNAS_MATERIAS, panorama.materias.map(materia => ({
    code: materia.code,
    name: materia.name,
    // El asterisco marca lo deducido de la adscripción del docente. Sin la
    // marca, un dato aproximado se lee como declarado y acaba en un acta.
    programa: materia.programaDeducido ? `${materia.programaNombre} *` : materia.programaNombre,
    period: materia.period,
    docente: materia.docente?.nombre ?? 'Sin asignar',
    correo: materia.docente?.email ?? '',
    grupos: materia.grupos,
    estudiantes: materia.estudiantes,
    promedio: nota(materia.promedio),
    aprobados: materia.aprobados,
    reprobados: materia.reprobados,
    sinNotas: materia.sinNotas,
    enRiesgo: materia.enRiesgo,
    asistencia: nota(materia.asistencia),
  })), membrete);

  hoja(wb, 'Docentes', COLUMNAS_DOCENTES, panorama.docentes.map(docente => ({
    nombre: docente.nombre,
    cedula: docente.cedula ?? '',
    correo: docente.email,
    programas: docente.programasNombres.join(' · '),
    materias: docente.materias.map(materia => `${materia.code} ${materia.name}`).join(' · '),
    total: docente.materias.length,
    grupos: docente.grupos,
    estudiantes: docente.estudiantes,
    promedio: nota(docente.promedio),
    enRiesgo: docente.enRiesgo,
    director: docente.esDirectorTrabajoGrado ? 'Sí' : 'No',
  })), membrete);

  hoja(wb, 'Grupos', COLUMNAS_GRUPOS, panorama.grupos.map(grupo => ({
    name: grupo.name,
    materia: grupo.materia ? `${grupo.materia.code} ${grupo.materia.name}` : '',
    programa: grupo.programaNombre,
    period: grupo.period,
    docente: grupo.docente?.nombre ?? 'Sin asignar',
    estudiantes: grupo.estudiantes,
    promedio: nota(grupo.promedio),
    enRiesgo: grupo.enRiesgo,
  })), membrete);

  await enviarExcel(res, wb, filename);
}
