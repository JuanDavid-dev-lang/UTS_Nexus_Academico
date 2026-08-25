import { Router } from 'express';
import ExcelJS from 'exceljs';
import { identificar, requireRole } from '../../middlewares/auth.js';
import { ConfigModel } from '../../models/config.model.js';
import { auditChange } from '../../shared/audit.js';
import { emitSync } from '../../shared/socket.js';
import { CATALOGOS, construirFilas, construirFilasTexto } from './report-columns.js';
import {
  CLAVE_PLANTILLA,
  getPlantilla,
  plantillaSchema,
  resolverColumnas,
  type Plantilla,
} from './report-template.js';
import { formatDate, startPdf, tablaDeCatalogo } from './pdf.renderer.js';
import { enviarExcel, hojaDeCatalogo } from './excel.renderer.js';
import {
  buscarAsistencia,
  buscarNotas,
  ordenarNotasParaActa,
  consolidadoOrdenado,
  filtrosDeConsulta,
  resolveMaps,
  resumenGeneral,
} from './reports.service.js';

/**
 * Rutas de reportes. **Solo HTTP**: valida, autoriza, delega y responde.
 *
 * Este archivo tenía 582 líneas y hacía cuatro oficios a la vez — dibujar PDF,
 * generar Excel, consultar Mongo con cinco modelos y enrutar—, que es como
 * llegan a existir los archivos que nadie quiere abrir. Ahora el dibujo vive
 * en `pdf.renderer.ts`, las hojas en `excel.renderer.ts` y los datos en
 * `reports.service.ts`.
 *
 * La regla que lo mantiene así: **una ruta no importa un Modelo.**
 */
export const reportsRouter = Router();
reportsRouter.use(identificar);

const TITULOS_POR_DEFECTO = {
  consolidado: 'Consolidado de Notas Finales UTS',
  grades: 'Reporte de Notas UTS',
  attendance: 'Reporte de Asistencia UTS',
  combined: 'Reporte Academico Completo UTS',
} as const;

function tituloDe(plantilla: Plantilla, kind: keyof typeof TITULOS_POR_DEFECTO): string {
  return plantilla.titulos[kind] ?? TITULOS_POR_DEFECTO[kind];
}

reportsRouter.get('/summary', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'), async (_req, res, next) => {
  try {
    res.json({ ok: true, summary: await resumenGeneral() });
  } catch (err) {
    next(err);
  }
});

/**
 * Plantilla de los reportes. El catálogo de columnas viaja con ella para que
 * el editor del cliente muestre exactamente las columnas que existen, sin
 * duplicar la lista.
 */
reportsRouter.get('/template', requireRole('ADMIN', 'COORDINATOR'), async (_req, res, next) => {
  try {
    const plantilla = await getPlantilla();
    res.json({
      ok: true,
      plantilla,
      columnasDisponibles: {
        consolidado: CATALOGOS.consolidado.map(c => ({ key: c.key, header: c.header })),
        grades: CATALOGOS.grades.map(c => ({ key: c.key, header: c.header })),
        attendance: CATALOGOS.attendance.map(c => ({ key: c.key, header: c.header })),
      },
    });
  } catch (err) {
    next(err);
  }
});

reportsRouter.put('/template', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const plantilla = plantillaSchema.parse(req.body);

    const antes = await ConfigModel.findOne({ key: CLAVE_PLANTILLA }).lean();
    const item = await ConfigModel.findOneAndUpdate(
      { key: CLAVE_PLANTILLA },
      { $set: { key: CLAVE_PLANTILLA, value: plantilla, deletedAt: null } },
      { upsert: true, new: true }
    );

    // Cambiar cómo se ven las actas que salen con membrete institucional es de
    // las cosas que hay que poder mirar después y saber quién la hizo.
    await auditChange({
      actorId: req.user?.id,
      action: 'UPDATE',
      entity: 'PlantillaReportes',
      entityId: item.id,
      before: antes?.value,
      after: plantilla,
    });

    emitSync('sync:update', { entity: 'reportTemplate', action: 'update', id: item.id });
    res.json({ ok: true, plantilla });
  } catch (err) {
    next(err);
  }
});

/**
 * Vista previa de la asistencia que saldría en el PDF/Excel: mismas columnas,
 * mismas filas, mismo orden — construidas por el MISMO catálogo, así que lo
 * que se ve es exactamente lo que se descarga. Cap a 300 filas para no
 * reventar la UI; `total` dice cuántas saldrían de verdad en el archivo.
 */
reportsRouter.get('/preview/attendance', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'), async (req, res, next) => {
  try {
    const filters = filtrosDeConsulta(req.query, req.user, req.alcance);
    const [attendance, plantilla] = await Promise.all([
      buscarAsistencia(filters, { date: -1 }),
      getPlantilla(),
    ]);
    // El diccionario de nombres se pide DESPUÉS de las filas, no en
    // paralelo: solo así puede acotarse a los ids que salen en ellas.
    const maps = await resolveMaps(attendance);

    const columnas = resolverColumnas(plantilla, 'attendance');
    const TOPE = 300;
    const filas = construirFilasTexto(columnas, attendance.slice(0, TOPE), maps);
    res.json({
      ok: true,
      headers: columnas.map(c => c.header),
      rows: filas,
      total: attendance.length,
      truncado: attendance.length > TOPE,
    });
  } catch (err) {
    next(err);
  }
});

reportsRouter.get('/pdf/consolidado', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'), async (req, res, next) => {
  try {
    const [records, plantilla] = await Promise.all([
      consolidadoOrdenado(req.query, req.user),
      getPlantilla(),
    ]);
    // El diccionario de nombres se pide DESPUÉS de las filas, no en
    // paralelo: solo así puede acotarse a los ids que salen en ellas.
    const maps = await resolveMaps(records);
    const columnas = resolverColumnas(plantilla, 'consolidado');

    const doc = startPdf(tituloDe(plantilla, 'consolidado'), 'consolidado-notas.pdf', res, plantilla);
    doc.fontSize(10).fillColor('#9fb0bb').text(`Periodo: ${req.query.period || 'Todos'}`);
    doc.moveDown(0.6);

    tablaDeCatalogo(doc, columnas, construirFilasTexto(columnas, records, maps), plantilla);
    if (!records.length) doc.fillColor('#dbe6ec').fontSize(10).text('Sin notas registradas.');
    doc.end();
  } catch (err) {
    next(err);
  }
});

reportsRouter.get('/excel/consolidado', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'), async (req, res, next) => {
  try {
    const [records, plantilla] = await Promise.all([
      consolidadoOrdenado(req.query, req.user),
      getPlantilla(),
    ]);
    // El diccionario de nombres se pide DESPUÉS de las filas, no en
    // paralelo: solo así puede acotarse a los ids que salen en ellas.
    const maps = await resolveMaps(records);
    const columnas = resolverColumnas(plantilla, 'consolidado');

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Consolidado');
    hojaDeCatalogo(ws, columnas, plantilla);
    construirFilas(columnas, records, maps).forEach(fila => ws.addRow(fila));

    await enviarExcel(res, wb, 'consolidado-notas.xlsx');
  } catch (err) {
    next(err);
  }
});

reportsRouter.get('/pdf/grades', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'), async (req, res, next) => {
  try {
    const filters = filtrosDeConsulta(req.query, req.user, req.alcance);
    const [grades, plantilla] = await Promise.all([
      buscarNotas(filters, { studentId: 1 }),
      getPlantilla(),
    ]);
    // El diccionario de nombres se pide DESPUÉS de las filas, no en
    // paralelo: solo así puede acotarse a los ids que salen en ellas.
    const maps = await resolveMaps(grades);
    const columnas = resolverColumnas(plantilla, 'grades');

    const doc = startPdf(tituloDe(plantilla, 'grades'), 'reporte-notas.pdf', res, plantilla);
    doc.fontSize(10).fillColor('#9fb0bb').text(`Periodo: ${filters.period || 'Todos'}`);
    if (filters.groupId) doc.text(`Grupo: ${filters.groupId}`);
    if (filters.studentId) doc.text(`Estudiante: ${filters.studentId}`);
    if (filters.subjectId) doc.text(`Materia: ${filters.subjectId}`);
    doc.moveDown(0.6);

    tablaDeCatalogo(doc, columnas, construirFilasTexto(columnas, ordenarNotasParaActa(grades, maps), maps), plantilla);
    if (!grades.length) doc.fillColor('#dbe6ec').fontSize(10).text('Sin notas registradas.');
    doc.end();
  } catch (err) {
    next(err);
  }
});

reportsRouter.get('/pdf/attendance', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'), async (req, res, next) => {
  try {
    const filters = filtrosDeConsulta(req.query, req.user, req.alcance);
    const [attendance, plantilla] = await Promise.all([
      buscarAsistencia(filters, { date: -1 }),
      getPlantilla(),
    ]);
    // El diccionario de nombres se pide DESPUÉS de las filas, no en
    // paralelo: solo así puede acotarse a los ids que salen en ellas.
    const maps = await resolveMaps(attendance);
    const columnas = resolverColumnas(plantilla, 'attendance');

    const doc = startPdf(tituloDe(plantilla, 'attendance'), 'reporte-asistencia.pdf', res, plantilla);
    doc.fontSize(10).fillColor('#9fb0bb').text(`Periodo: ${filters.period || 'Todos'}`);
    if (filters.dateFrom || filters.dateTo) doc.text(`Rango: ${formatDate(filters.dateFrom)} - ${formatDate(filters.dateTo)}`);
    if (filters.groupId) doc.text(`Grupo: ${filters.groupId}`);
    if (filters.studentId) doc.text(`Estudiante: ${filters.studentId}`);
    if (filters.subjectId) doc.text(`Materia: ${filters.subjectId}`);
    doc.moveDown(0.6);

    tablaDeCatalogo(doc, columnas, construirFilasTexto(columnas, attendance, maps), plantilla);
    if (!attendance.length) doc.fillColor('#dbe6ec').fontSize(10).text('Sin asistencia registrada.');
    doc.end();
  } catch (err) {
    next(err);
  }
});

reportsRouter.get('/pdf/combined', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'), async (req, res, next) => {
  try {
    const filters = filtrosDeConsulta(req.query, req.user, req.alcance);
    const [grades, attendance, plantilla] = await Promise.all([
      buscarNotas(filters, { studentId: 1, subjectId: 1 }),
      buscarAsistencia(filters, { date: -1 }),
      getPlantilla(),
    ]);
    // El diccionario de nombres se pide DESPUÉS de las filas, no en
    // paralelo: solo así puede acotarse a los ids que salen en ellas.
    const maps = await resolveMaps(grades, attendance);
    const columnasNotas = resolverColumnas(plantilla, 'grades');
    const columnasAsistencia = resolverColumnas(plantilla, 'attendance');

    const doc = startPdf(tituloDe(plantilla, 'combined'), 'reporte-completo.pdf', res, plantilla);
    doc.fontSize(10).fillColor('#9fb0bb').text(`Periodo: ${filters.period || 'Todos'}`);
    doc.moveDown(0.5);

    doc.fontSize(13).fillColor('#0b1115').text('Notas');
    tablaDeCatalogo(doc, columnasNotas, construirFilasTexto(columnasNotas, ordenarNotasParaActa(grades, maps), maps), plantilla);

    doc.fontSize(13).fillColor('#0b1115').text('Asistencias');
    tablaDeCatalogo(doc, columnasAsistencia, construirFilasTexto(columnasAsistencia, attendance, maps), plantilla);

    if (!grades.length && !attendance.length) {
      doc.fillColor('#dbe6ec').fontSize(10).text('Sin datos disponibles.');
    }
    doc.end();
  } catch (err) {
    next(err);
  }
});

reportsRouter.get('/excel/grades', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'), async (req, res, next) => {
  try {
    const filters = filtrosDeConsulta(req.query, req.user, req.alcance);
    const [grades, plantilla] = await Promise.all([
      buscarNotas(filters, { studentId: 1 }),
      getPlantilla(),
    ]);
    // El diccionario de nombres se pide DESPUÉS de las filas, no en
    // paralelo: solo así puede acotarse a los ids que salen en ellas.
    const maps = await resolveMaps(grades);
    const columnas = resolverColumnas(plantilla, 'grades');

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Notas');
    hojaDeCatalogo(ws, columnas, plantilla);
    construirFilas(columnas, ordenarNotasParaActa(grades, maps), maps).forEach(fila => ws.addRow(fila));

    await enviarExcel(res, wb, 'reporte-notas.xlsx');
  } catch (err) {
    next(err);
  }
});

reportsRouter.get('/excel/attendance', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'), async (req, res, next) => {
  try {
    const filters = filtrosDeConsulta(req.query, req.user, req.alcance);
    const [attendance, plantilla] = await Promise.all([
      buscarAsistencia(filters, { date: 1 }),
      getPlantilla(),
    ]);
    // El diccionario de nombres se pide DESPUÉS de las filas, no en
    // paralelo: solo así puede acotarse a los ids que salen en ellas.
    const maps = await resolveMaps(attendance);
    const columnas = resolverColumnas(plantilla, 'attendance');

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Asistencia');
    hojaDeCatalogo(ws, columnas, plantilla);
    construirFilas(columnas, attendance, maps).forEach(fila => ws.addRow(fila));

    await enviarExcel(res, wb, 'reporte-asistencia.xlsx');
  } catch (err) {
    next(err);
  }
});

reportsRouter.get('/excel/combined', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'), async (req, res, next) => {
  try {
    const filters = filtrosDeConsulta(req.query, req.user, req.alcance);
    const [grades, attendance, plantilla] = await Promise.all([
      buscarNotas(filters, { studentId: 1, subjectId: 1 }),
      buscarAsistencia(filters, { date: 1 }),
      getPlantilla(),
    ]);
    // El diccionario de nombres se pide DESPUÉS de las filas, no en
    // paralelo: solo así puede acotarse a los ids que salen en ellas.
    const maps = await resolveMaps(grades, attendance);
    const columnasNotas = resolverColumnas(plantilla, 'grades');
    const columnasAsistencia = resolverColumnas(plantilla, 'attendance');

    const wb = new ExcelJS.Workbook();
    const gradeWs = wb.addWorksheet('Notas');
    hojaDeCatalogo(gradeWs, columnasNotas, plantilla);
    construirFilas(columnasNotas, ordenarNotasParaActa(grades, maps), maps).forEach(fila => gradeWs.addRow(fila));

    const attendanceWs = wb.addWorksheet('Asistencia');
    hojaDeCatalogo(attendanceWs, columnasAsistencia, plantilla);
    construirFilas(columnasAsistencia, attendance, maps).forEach(fila => attendanceWs.addRow(fila));

    await enviarExcel(res, wb, 'reporte-academico.xlsx');
  } catch (err) {
    next(err);
  }
});
