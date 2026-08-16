import path from 'node:path';
import fs from 'node:fs';
import { Router } from 'express';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import { identificar, requireRole } from '../../middlewares/auth.js';
import { StudentModel } from '../../models/student.model.js';
import { GradeModel } from '../../models/grade.model.js';
import { AttendanceModel } from '../../models/attendance.model.js';
import { SubjectModel } from '../../models/subject.model.js';
import { GroupModel } from '../../models/group.model.js';
import { ConfigModel } from '../../models/config.model.js';
import { computeAcademicRecords } from '../../shared/academic.service.js';
import { auditChange } from '../../shared/audit.js';
import { emitSync } from '../../shared/socket.js';
import {
  CATALOGOS,
  construirFilas,
  construirFilasTexto,
  type ColumnaReporte,
  type MapBundle,
} from './report-columns.js';
import {
  CLAVE_PLANTILLA,
  getPlantilla,
  hexAArgb,
  plantillaSchema,
  resolverColumnas,
  type Plantilla,
} from './report-template.js';

export const reportsRouter = Router();
reportsRouter.use(identificar);

type ReportFilters = {
  period?: string;
  subjectId?: string;
  studentId?: string;
  groupId?: string;
  teacherId?: string;
  dateFrom?: Date | null;
  dateTo?: Date | null;
};

function startPdf(title: string, filename: string, res: any, plantilla: Plantilla) {
  const doc = new PDFDocument({ margin: 32, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  doc.pipe(res);
  drawHeader(doc, title, plantilla);
  return doc;
}

function drawHeader(doc: any, title: string, plantilla: Plantilla) {
  // Membrete: logo subido si existe y se puede leer; si no, el recuadro con la
  // sigla. Un logo corrupto no debe tumbar el acta que el docente entrega.
  let logoDibujado = false;
  if (plantilla.logoUrl) {
    const ruta = path.join(process.cwd(), 'uploads', path.basename(plantilla.logoUrl));
    if (fs.existsSync(ruta)) {
      try {
        doc.image(ruta, 32, 26, { fit: [58, 58] });
        logoDibujado = true;
      } catch {
        logoDibujado = false;
      }
    }
  }
  if (!logoDibujado) {
    doc.roundedRect(32, 26, 58, 58, 12).fillAndStroke(plantilla.colores.marca, plantilla.colores.marca);
    doc.fillColor('#081115').font('Helvetica-Bold').fontSize(24).text(plantilla.sigla, 44, 48);
  }
  doc.fillColor('#0b1115').font('Helvetica-Bold').fontSize(22).text(title, 108, 38);
  // "Universidad de Santander" es OTRA institución (UDES). Estos PDF son actas
  // que el docente entrega, así que el nombre tiene que ser el correcto.
  doc.fillColor('#9fb0bb').font('Helvetica').fontSize(10).text(plantilla.institucion, 108, 64);
  doc.moveTo(32, 94).lineTo(562, 94).strokeColor('#23323c').lineWidth(1).stroke();
  doc.moveDown(1.8);
}

function filtersFromQuery(query: any, user?: { id: string; role: string }): ReportFilters {
  const filters: ReportFilters = {};
  if (query.period) filters.period = String(query.period);
  if (query.subjectId) filters.subjectId = String(query.subjectId);
  if (query.studentId) filters.studentId = String(query.studentId);
  if (query.groupId) filters.groupId = String(query.groupId);
  if (query.teacherId) filters.teacherId = String(query.teacherId);
  if (query.dateFrom) filters.dateFrom = new Date(String(query.dateFrom));
  if (query.dateTo) filters.dateTo = new Date(String(query.dateTo));
  if (!filters.teacherId && user?.role === 'PROFESSOR') filters.teacherId = user.id;
  return filters;
}

function buildGradeFilter(filters: ReportFilters) {
  const query: Record<string, unknown> = { deletedAt: null };
  if (filters.period) query.period = filters.period;
  if (filters.subjectId) query.subjectId = filters.subjectId;
  if (filters.studentId) query.studentId = filters.studentId;
  if (filters.groupId) query.groupId = filters.groupId;
  if (filters.teacherId) query.teacherId = filters.teacherId;
  return query;
}

function buildAttendanceFilter(filters: ReportFilters) {
  const query: Record<string, unknown> = { deletedAt: null };
  if (filters.period) query.period = filters.period;
  if (filters.subjectId) query.subjectId = filters.subjectId;
  if (filters.studentId) query.studentId = filters.studentId;
  if (filters.groupId) query.groupId = filters.groupId;
  if (filters.teacherId) query.teacherId = filters.teacherId;
  if (filters.dateFrom || filters.dateTo) {
    query.date = {};
    if (filters.dateFrom) (query.date as Record<string, unknown>).$gte = filters.dateFrom;
    if (filters.dateTo) (query.date as Record<string, unknown>).$lte = filters.dateTo;
  }
  return query;
}

function formatDate(value: unknown) {
  const date = new Date(value as any);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function table(doc: any, headers: string[], rows: string[][], widths: number[], headerFill = '#d7f0e5') {
  const startX = 32;
  let y = doc.y;
  const rowHeight = 20;
  // Límite inferior útil de la página (deja margen de 40pt abajo).
  const bottomLimit = () => doc.page.height - 40;

  const drawRow = (cells: string[], isHeader = false) => {
    let x = startX;
    doc.font(isHeader ? 'Helvetica-Bold' : 'Helvetica').fontSize(9);
    cells.forEach((cell, i) => {
      // 1) Fondo de la celda. 2) SIEMPRE se re-fija fillColor antes del texto,
      // porque fillAndStroke deja el color de relleno activo y el texto lo heredaría
      // (esa herencia es la causa de la "letra ilegible").
      doc
        .rect(x, y, widths[i], rowHeight)
        .fillAndStroke(isHeader ? headerFill : '#f7fbfc', '#dbe6ec');
      doc
        .fillColor(isHeader ? '#0b1115' : '#18242c')
        .text(cell, x + 4, y + 6, { width: widths[i] - 8, ellipsis: true, lineBreak: false });
      x += widths[i];
    });
    y += rowHeight;
  };

  drawRow(headers, true);
  rows.forEach(row => {
    // Salto de página: si la siguiente fila no cabe, nueva página + repetir encabezado.
    if (y + rowHeight > bottomLimit()) {
      doc.addPage();
      y = doc.page.margins.top;
      drawRow(headers, true);
    }
    drawRow(row);
  });
  doc.y = y + 8;
}

/** Dibuja en el PDF la tabla de un catálogo de columnas. */
function tablaDeCatalogo(doc: any, columnas: ColumnaReporte[], filas: string[][], plantilla: Plantilla) {
  table(doc, columnas.map(c => c.header), filas, columnas.map(c => c.pdfWidth), plantilla.colores.encabezadoTabla);
}

/** Configura las columnas de una hoja Excel desde el catálogo. */
function hojaDeCatalogo(ws: ExcelJS.Worksheet, columnas: ColumnaReporte[], plantilla: Plantilla) {
  ws.columns = columnas.map(c => ({ header: c.header, key: c.key, width: c.excelWidth }));
  excelSheetStyle(ws, columnas.length, hexAArgb(plantilla.colores.encabezadoExcel));
}

async function resolveMaps(): Promise<MapBundle> {
  const [subjects, students, groups] = await Promise.all([
    SubjectModel.find({ deletedAt: null }).lean(),
    StudentModel.find({ deletedAt: null }).lean(),
    GroupModel.find({ deletedAt: null }).lean(),
  ]);

  return {
    subjects: new Map(subjects.map(item => [String(item._id), item])),
    students: new Map(students.map(item => [String(item._id), item])),
    groups: new Map(groups.map(item => [String(item._id), item])),
  };
}

function excelSheetStyle(ws: ExcelJS.Worksheet, widthCount: number, headerArgb = 'FF17313B') {
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: headerArgb },
  };
  ws.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
  ws.autoFilter = { from: 'A1', to: `${String.fromCharCode(64 + widthCount)}1` };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

async function enviarExcel(res: any, wb: ExcelJS.Workbook, filename: string) {
  const buffer = await wb.xlsx.writeBuffer();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(Buffer.from(buffer));
}

reportsRouter.get('/summary', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'), async (_req, res, next) => {
  try {
    const [students, averageGrade, averageAttendance] = await Promise.all([
      StudentModel.countDocuments({ deletedAt: null }),
      GradeModel.aggregate([{ $match: { deletedAt: null } }, { $group: { _id: null, avg: { $avg: '$score' } } }]),
      AttendanceModel.aggregate([{ $match: { deletedAt: null } }, { $group: { _id: null, avg: { $avg: { $cond: ['$present', 1, 0] } } } }]),
    ]);
    res.json({
      ok: true,
      summary: {
        students,
        averageGrade: averageGrade[0]?.avg ?? 0,
        averageAttendance: Number(((averageAttendance[0]?.avg ?? 0) * 100).toFixed(2)),
      },
    });
  } catch (err) {
    next(err);
  }
});

/** Filtro académico (nota final consolidada) según rol. */
function academicFilterFromQuery(query: any, user?: { id: string; role: string }) {
  const filter: { teacherId?: string; studentId?: string; period?: string } = {};
  if (query.period) filter.period = String(query.period);
  if (query.studentId) filter.studentId = String(query.studentId);
  if (user?.role === 'PROFESSOR') filter.teacherId = user.id;
  else if (query.teacherId) filter.teacherId = String(query.teacherId);
  return filter;
}

/** Registros consolidados con notas, ordenados como salen en el acta. */
async function consolidadoOrdenado(query: any, user?: { id: string; role: string }) {
  const records = await computeAcademicRecords(academicFilterFromQuery(query, user));
  return records.filter(r => r.tieneNotas).sort((a, b) => a.fullName.localeCompare(b.fullName));
}

const TITULOS_POR_DEFECTO = {
  consolidado: 'Consolidado de Notas Finales UTS',
  grades: 'Reporte de Notas UTS',
  attendance: 'Reporte de Asistencia UTS',
  combined: 'Reporte Academico Completo UTS',
} as const;

function tituloDe(plantilla: Plantilla, kind: keyof typeof TITULOS_POR_DEFECTO): string {
  return plantilla.titulos[kind] ?? TITULOS_POR_DEFECTO[kind];
}

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
    const filters = filtersFromQuery(req.query, req.user);
    const [attendance, maps, plantilla] = await Promise.all([
      AttendanceModel.find(buildAttendanceFilter(filters)).sort({ date: -1 }).lean(),
      resolveMaps(),
      getPlantilla(),
    ]);

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
    const [records, maps, plantilla] = await Promise.all([
      consolidadoOrdenado(req.query, req.user),
      resolveMaps(),
      getPlantilla(),
    ]);
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
    const [records, maps, plantilla] = await Promise.all([
      consolidadoOrdenado(req.query, req.user),
      resolveMaps(),
      getPlantilla(),
    ]);
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
    const filters = filtersFromQuery(req.query, req.user);
    const [grades, maps, plantilla] = await Promise.all([
      GradeModel.find(buildGradeFilter(filters)).sort({ studentId: 1 }).lean(),
      resolveMaps(),
      getPlantilla(),
    ]);
    const columnas = resolverColumnas(plantilla, 'grades');

    const doc = startPdf(tituloDe(plantilla, 'grades'), 'reporte-notas.pdf', res, plantilla);
    doc.fontSize(10).fillColor('#9fb0bb').text(`Periodo: ${filters.period || 'Todos'}`);
    if (filters.groupId) doc.text(`Grupo: ${filters.groupId}`);
    if (filters.studentId) doc.text(`Estudiante: ${filters.studentId}`);
    if (filters.subjectId) doc.text(`Materia: ${filters.subjectId}`);
    doc.moveDown(0.6);

    tablaDeCatalogo(doc, columnas, construirFilasTexto(columnas, grades, maps), plantilla);
    if (!grades.length) doc.fillColor('#dbe6ec').fontSize(10).text('Sin notas registradas.');
    doc.end();
  } catch (err) {
    next(err);
  }
});

reportsRouter.get('/pdf/attendance', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'), async (req, res, next) => {
  try {
    const filters = filtersFromQuery(req.query, req.user);
    const [attendance, maps, plantilla] = await Promise.all([
      AttendanceModel.find(buildAttendanceFilter(filters)).sort({ date: -1 }).lean(),
      resolveMaps(),
      getPlantilla(),
    ]);
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
    const filters = filtersFromQuery(req.query, req.user);
    const [grades, attendance, maps, plantilla] = await Promise.all([
      GradeModel.find(buildGradeFilter(filters)).sort({ studentId: 1, subjectId: 1 }).lean(),
      AttendanceModel.find(buildAttendanceFilter(filters)).sort({ date: -1 }).lean(),
      resolveMaps(),
      getPlantilla(),
    ]);
    const columnasNotas = resolverColumnas(plantilla, 'grades');
    const columnasAsistencia = resolverColumnas(plantilla, 'attendance');

    const doc = startPdf(tituloDe(plantilla, 'combined'), 'reporte-completo.pdf', res, plantilla);
    doc.fontSize(10).fillColor('#9fb0bb').text(`Periodo: ${filters.period || 'Todos'}`);
    doc.moveDown(0.5);

    doc.fontSize(13).fillColor('#0b1115').text('Notas');
    tablaDeCatalogo(doc, columnasNotas, construirFilasTexto(columnasNotas, grades, maps), plantilla);

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
    const filters = filtersFromQuery(req.query, req.user);
    const [grades, maps, plantilla] = await Promise.all([
      GradeModel.find(buildGradeFilter(filters)).sort({ studentId: 1 }).lean(),
      resolveMaps(),
      getPlantilla(),
    ]);
    const columnas = resolverColumnas(plantilla, 'grades');

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Notas');
    hojaDeCatalogo(ws, columnas, plantilla);
    construirFilas(columnas, grades, maps).forEach(fila => ws.addRow(fila));

    await enviarExcel(res, wb, 'reporte-notas.xlsx');
  } catch (err) {
    next(err);
  }
});

reportsRouter.get('/excel/attendance', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'), async (req, res, next) => {
  try {
    const filters = filtersFromQuery(req.query, req.user);
    const [attendance, maps, plantilla] = await Promise.all([
      AttendanceModel.find(buildAttendanceFilter(filters)).sort({ date: 1 }).lean(),
      resolveMaps(),
      getPlantilla(),
    ]);
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
    const filters = filtersFromQuery(req.query, req.user);
    const [grades, attendance, maps, plantilla] = await Promise.all([
      GradeModel.find(buildGradeFilter(filters)).sort({ studentId: 1, subjectId: 1 }).lean(),
      AttendanceModel.find(buildAttendanceFilter(filters)).sort({ date: 1 }).lean(),
      resolveMaps(),
      getPlantilla(),
    ]);
    const columnasNotas = resolverColumnas(plantilla, 'grades');
    const columnasAsistencia = resolverColumnas(plantilla, 'attendance');

    const wb = new ExcelJS.Workbook();
    const gradeWs = wb.addWorksheet('Notas');
    hojaDeCatalogo(gradeWs, columnasNotas, plantilla);
    construirFilas(columnasNotas, grades, maps).forEach(fila => gradeWs.addRow(fila));

    const attendanceWs = wb.addWorksheet('Asistencia');
    hojaDeCatalogo(attendanceWs, columnasAsistencia, plantilla);
    construirFilas(columnasAsistencia, attendance, maps).forEach(fila => attendanceWs.addRow(fila));

    await enviarExcel(res, wb, 'reporte-academico.xlsx');
  } catch (err) {
    next(err);
  }
});
