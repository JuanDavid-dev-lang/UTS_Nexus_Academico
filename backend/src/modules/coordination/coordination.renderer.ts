import ExcelJS from 'exceljs';
import { excelSheetStyle, enviarExcel } from '../reports/excel.renderer.js';
import type { Panorama } from './coordination.service.js';

/**
 * Exportables de coordinación.
 *
 * Un libro con tres hojas —materias, docentes y grupos— y no tres descargas
 * distintas: quien exporta esto lo está preparando para una reunión, y tres
 * archivos sueltos se convierten en tres versiones que ya no coinciden en
 * cuanto alguien exporta una de ellas al día siguiente.
 *
 * Vive aparte de las rutas por lo mismo que el resto de renderers del
 * proyecto: cambiar el ancho de una columna no debería obligar a abrir el
 * archivo donde se decide quién puede descargarla.
 */

/** `null` en una celda de nota se escribe vacío, nunca 0: no son lo mismo. */
function nota(valor: number | null): number | string {
  return valor == null ? '' : valor;
}

export async function enviarPanoramaExcel(
  res: { setHeader(name: string, value: string): void; send(body: Buffer): void },
  panorama: Panorama,
  filename: string,
) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'UTS Nexus Académico';

  // ── Materias ──────────────────────────────────────────────────────────────
  const materias = wb.addWorksheet('Materias');
  materias.columns = [
    { header: 'Código', key: 'code', width: 14 },
    { header: 'Materia', key: 'name', width: 38 },
    { header: 'Programa', key: 'programa', width: 40 },
    { header: 'Periodo', key: 'period', width: 10 },
    { header: 'Docente', key: 'docente', width: 30 },
    { header: 'Correo', key: 'correo', width: 30 },
    { header: 'Grupos', key: 'grupos', width: 9 },
    { header: 'Estudiantes', key: 'estudiantes', width: 13 },
    { header: 'Promedio', key: 'promedio', width: 11 },
    { header: 'Aprobados', key: 'aprobados', width: 11 },
    { header: 'Reprobados', key: 'reprobados', width: 12 },
    { header: 'Sin notas', key: 'sinNotas', width: 11 },
    { header: 'En riesgo', key: 'enRiesgo', width: 11 },
    { header: 'Asistencia %', key: 'asistencia', width: 13 },
  ];
  excelSheetStyle(materias, 14);
  for (const materia of panorama.materias) {
    materias.addRow({
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
    });
  }

  // ── Docentes ──────────────────────────────────────────────────────────────
  const docentes = wb.addWorksheet('Docentes');
  docentes.columns = [
    { header: 'Docente', key: 'nombre', width: 30 },
    { header: 'Cédula', key: 'cedula', width: 16 },
    { header: 'Correo', key: 'correo', width: 30 },
    { header: 'Programas', key: 'programas', width: 44 },
    { header: 'Materias', key: 'materias', width: 44 },
    { header: 'N.º materias', key: 'total', width: 13 },
    { header: 'Grupos', key: 'grupos', width: 9 },
    { header: 'Estudiantes', key: 'estudiantes', width: 13 },
    { header: 'Promedio', key: 'promedio', width: 11 },
    { header: 'En riesgo', key: 'enRiesgo', width: 11 },
    { header: 'Dirige trabajos de grado', key: 'director', width: 24 },
  ];
  excelSheetStyle(docentes, 11);
  for (const docente of panorama.docentes) {
    docentes.addRow({
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
    });
  }

  // ── Grupos ────────────────────────────────────────────────────────────────
  const grupos = wb.addWorksheet('Grupos');
  grupos.columns = [
    { header: 'Grupo', key: 'name', width: 16 },
    { header: 'Materia', key: 'materia', width: 38 },
    { header: 'Programa', key: 'programa', width: 40 },
    { header: 'Periodo', key: 'period', width: 10 },
    { header: 'Docente', key: 'docente', width: 30 },
    { header: 'Estudiantes', key: 'estudiantes', width: 13 },
    { header: 'Promedio', key: 'promedio', width: 11 },
    { header: 'En riesgo', key: 'enRiesgo', width: 11 },
  ];
  excelSheetStyle(grupos, 8);
  for (const grupo of panorama.grupos) {
    grupos.addRow({
      name: grupo.name,
      materia: grupo.materia ? `${grupo.materia.code} ${grupo.materia.name}` : '',
      programa: grupo.programaNombre,
      period: grupo.period,
      docente: grupo.docente?.nombre ?? 'Sin asignar',
      estudiantes: grupo.estudiantes,
      promedio: nota(grupo.promedio),
      enRiesgo: grupo.enRiesgo,
    });
  }

  await enviarExcel(res, wb, filename);
}
