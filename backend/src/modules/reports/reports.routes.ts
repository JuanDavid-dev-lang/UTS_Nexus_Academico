import { Router } from 'express';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import { auth, requireRole } from '../../middlewares/auth.js';
import { StudentModel } from '../../models/student.model.js';
import { GradeModel } from '../../models/grade.model.js';
import { AttendanceModel } from '../../models/attendance.model.js';
import { SubjectModel } from '../../models/subject.model.js';
import { GroupModel } from '../../models/group.model.js';
import { computeAcademicRecords } from '../../shared/academic.service.js';

export const reportsRouter = Router();
reportsRouter.use(auth);

type ReportFilters = {
  period?: string;
  subjectId?: string;
  studentId?: string;
  groupId?: string;
  teacherId?: string;
  dateFrom?: Date | null;
  dateTo?: Date | null;
};

type MapBundle = {
  subjects: Map<string, any>;
  students: Map<string, any>;
  groups: Map<string, any>;
};

function startPdf(title: string, filename: string, res: any) {
  const doc = new PDFDocument({ margin: 32, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  doc.pipe(res);
  drawHeader(doc, title);
  return doc;
}

function drawHeader(doc: any, title: string) {
  doc.roundedRect(32, 26, 58, 58, 12).fillAndStroke('#74d3b2', '#74d3b2');
  doc.fillColor('#081115').font('Helvetica-Bold').fontSize(24).text('UTS', 44, 48);
  doc.fillColor('#0b1115').font('Helvetica-Bold').fontSize(22).text(title, 108, 38);
  // "Universidad de Santander" es OTRA institución (UDES). Estos PDF son actas
  // que el docente entrega, así que el nombre tiene que ser el correcto.
  doc.fillColor('#9fb0bb').font('Helvetica').fontSize(10).text('Unidades Tecnológicas de Santander', 108, 64);
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

function table(doc: any, headers: string[], rows: string[][], widths: number[]) {
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
        .fillAndStroke(isHeader ? '#d7f0e5' : '#f7fbfc', '#dbe6ec');
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

function excelSheetStyle(ws: ExcelJS.Worksheet, widthCount: number) {
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF17313B' },
  };
  ws.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
  ws.autoFilter = { from: 'A1', to: `${String.fromCharCode(64 + widthCount)}1` };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
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

reportsRouter.get('/pdf/consolidado', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'), async (req, res, next) => {
  try {
    const [records, maps] = await Promise.all([
      computeAcademicRecords(academicFilterFromQuery(req.query, req.user)),
      resolveMaps(),
    ]);

    const doc = startPdf('Consolidado de Notas Finales UTS', 'consolidado-notas.pdf', res);
    doc.fontSize(10).fillColor('#9fb0bb').text(`Periodo: ${req.query.period || 'Todos'}`);
    doc.moveDown(0.6);

    const rows = records
      .filter(r => r.tieneNotas)
      .sort((a, b) => a.fullName.localeCompare(b.fullName))
      .map(r => {
        const subject = maps.subjects.get(String(r.subjectId));
        const cortesTexto = r.cortes.map((n, i) => `C${i + 1}:${n.toFixed(1)}`).join(' ');
        return [
          r.code,
          r.fullName,
          subject?.name ?? '',
          cortesTexto,
          r.notaFinal.toFixed(2),
          r.aprobado ? 'Aprobado' : 'Reprobado',
          `${r.riesgo.porcentajeAsistencia.toFixed(0)}%`,
        ];
      });

    table(
      doc,
      ['Cedula', 'Estudiante', 'Materia', 'Cortes', 'Final', 'Estado', 'Asist.'],
      rows,
      [52, 108, 96, 92, 40, 62, 40]
    );
    if (!rows.length) doc.fillColor('#dbe6ec').fontSize(10).text('Sin notas registradas.');
    doc.end();
  } catch (err) {
    next(err);
  }
});

reportsRouter.get('/excel/consolidado', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'), async (req, res, next) => {
  try {
    const [records, maps] = await Promise.all([
      computeAcademicRecords(academicFilterFromQuery(req.query, req.user)),
      resolveMaps(),
    ]);

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Consolidado');
    ws.columns = [
      { header: 'Cedula', key: 'code', width: 16 },
      { header: 'Estudiante', key: 'student', width: 28 },
      { header: 'Materia', key: 'subject', width: 28 },
      { header: 'Corte 1', key: 'c1', width: 10 },
      { header: 'Corte 2', key: 'c2', width: 10 },
      { header: 'Corte 3', key: 'c3', width: 10 },
      { header: 'Nota final', key: 'final', width: 12 },
      { header: 'Estado', key: 'estado', width: 12 },
      { header: 'Asistencia', key: 'asistencia', width: 12 },
      { header: 'Semestre', key: 'period', width: 12 },
    ];
    excelSheetStyle(ws, 10);
    records
      .filter(r => r.tieneNotas)
      .sort((a, b) => a.fullName.localeCompare(b.fullName))
      .forEach(r => {
        const subject = maps.subjects.get(String(r.subjectId));
        ws.addRow({
          code: r.code,
          student: r.fullName,
          subject: subject?.name ?? '',
          c1: r.cortes[0] ?? '',
          c2: r.cortes[1] ?? '',
          c3: r.cortes[2] ?? '',
          final: r.notaFinal,
          estado: r.aprobado ? 'Aprobado' : 'Reprobado',
          asistencia: `${r.riesgo.porcentajeAsistencia.toFixed(0)}%`,
          period: r.period,
        });
      });

    const buffer = await wb.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="consolidado-notas.xlsx"');
    res.send(Buffer.from(buffer));
  } catch (err) {
    next(err);
  }
});

reportsRouter.get('/pdf/grades', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'), async (req, res, next) => {
  try {
    const filters = filtersFromQuery(req.query, req.user);
    const [grades, maps] = await Promise.all([
      GradeModel.find(buildGradeFilter(filters)).sort({ studentId: 1 }).lean(),
      resolveMaps(),
    ]);

    const doc = startPdf('Reporte de Notas UTS', 'reporte-notas.pdf', res);
    doc.fontSize(10).fillColor('#9fb0bb').text(`Periodo: ${filters.period || 'Todos'}`);
    if (filters.groupId) doc.text(`Grupo: ${filters.groupId}`);
    if (filters.studentId) doc.text(`Estudiante: ${filters.studentId}`);
    if (filters.subjectId) doc.text(`Materia: ${filters.subjectId}`);
    doc.moveDown(0.6);

    const rows = grades.map(grade => {
      const student = maps.students.get(String(grade.studentId));
      const subject = maps.subjects.get(String(grade.subjectId));
      const group = maps.groups.get(String(grade.groupId ?? ''));
      return [
        student?.code ?? '',
        student?.fullName ?? '',
        group?.name ?? '',
        subject?.code ?? '',
        subject?.name ?? '',
        grade.corte ? `C${grade.corte} ${grade.componentType ?? ''}`.trim() : String(grade.component ?? ''),
        Number(grade.score ?? 0).toFixed(2),
        String(grade.period ?? ''),
      ];
    });

    table(doc, ['Cedula', 'Estudiante', 'Grupo', 'Codigo', 'Materia', 'Componente', 'Nota', 'Semestre'], rows, [52, 96, 52, 46, 88, 74, 42, 44]);
    if (!rows.length) doc.fillColor('#dbe6ec').fontSize(10).text('Sin notas registradas.');
    doc.end();
  } catch (err) {
    next(err);
  }
});

reportsRouter.get('/pdf/attendance', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'), async (req, res, next) => {
  try {
    const filters = filtersFromQuery(req.query, req.user);
    const [attendance, maps] = await Promise.all([
      AttendanceModel.find(buildAttendanceFilter(filters)).sort({ date: -1 }).lean(),
      resolveMaps(),
    ]);

    const doc = startPdf('Reporte de Asistencia UTS', 'reporte-asistencia.pdf', res);
    doc.fontSize(10).fillColor('#9fb0bb').text(`Periodo: ${filters.period || 'Todos'}`);
    if (filters.dateFrom || filters.dateTo) doc.text(`Rango: ${formatDate(filters.dateFrom)} - ${formatDate(filters.dateTo)}`);
    if (filters.groupId) doc.text(`Grupo: ${filters.groupId}`);
    if (filters.studentId) doc.text(`Estudiante: ${filters.studentId}`);
    if (filters.subjectId) doc.text(`Materia: ${filters.subjectId}`);
    doc.moveDown(0.6);

    const rows = attendance.map(row => {
      const student = maps.students.get(String(row.studentId));
      const subject = maps.subjects.get(String(row.subjectId));
      const group = maps.groups.get(String(row.groupId ?? ''));
      return [
        student?.code ?? '',
        student?.fullName ?? '',
        group?.name ?? '',
        subject?.code ?? '',
        subject?.name ?? '',
        formatDate(row.date),
        row.present ? 'Si' : 'No',
        row.notes ?? '',
      ];
    });

    table(doc, ['Cedula', 'Estudiante', 'Grupo', 'Codigo', 'Materia', 'Fecha', 'Asistencia', 'Observacion'], rows, [48, 88, 52, 44, 78, 58, 52, 86]);
    if (!rows.length) doc.fillColor('#dbe6ec').fontSize(10).text('Sin asistencia registrada.');
    doc.end();
  } catch (err) {
    next(err);
  }
});

reportsRouter.get('/pdf/combined', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'), async (req, res, next) => {
  try {
    const filters = filtersFromQuery(req.query, req.user);
    const [grades, attendance, maps] = await Promise.all([
      GradeModel.find(buildGradeFilter(filters)).sort({ studentId: 1, subjectId: 1 }).lean(),
      AttendanceModel.find(buildAttendanceFilter(filters)).sort({ date: -1 }).lean(),
      resolveMaps(),
    ]);

    const doc = startPdf('Reporte Academico Completo UTS', 'reporte-completo.pdf', res);
    doc.fontSize(10).fillColor('#9fb0bb').text(`Periodo: ${filters.period || 'Todos'}`);
    doc.moveDown(0.5);

    const gradeRows = grades.map(grade => {
      const student = maps.students.get(String(grade.studentId));
      const subject = maps.subjects.get(String(grade.subjectId));
      const group = maps.groups.get(String(grade.groupId ?? ''));
      return [
        student?.code ?? '',
        student?.fullName ?? '',
        group?.name ?? '',
        subject?.code ?? '',
        subject?.name ?? '',
        grade.corte ? `C${grade.corte} ${grade.componentType ?? ''}`.trim() : String(grade.component ?? ''),
        Number(grade.score ?? 0).toFixed(2),
      ];
    });

    const attendanceRows = attendance.map(row => {
      const student = maps.students.get(String(row.studentId));
      const subject = maps.subjects.get(String(row.subjectId));
      const group = maps.groups.get(String(row.groupId ?? ''));
      return [
        student?.code ?? '',
        student?.fullName ?? '',
        group?.name ?? '',
        subject?.code ?? '',
        subject?.name ?? '',
        formatDate(row.date),
        row.present ? 'Si' : 'No',
      ];
    });

    doc.fontSize(13).fillColor('#0b1115').text('Notas');
    table(doc, ['Cedula', 'Estudiante', 'Grupo', 'Codigo', 'Materia', 'Componente', 'Nota'], gradeRows, [48, 92, 52, 44, 84, 76, 42]);

    doc.fontSize(13).fillColor('#0b1115').text('Asistencias');
    table(doc, ['Cedula', 'Estudiante', 'Grupo', 'Codigo', 'Materia', 'Fecha', 'Asistencia'], attendanceRows, [48, 88, 52, 44, 78, 58, 52]);

    if (!gradeRows.length && !attendanceRows.length) {
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
    const [grades, maps] = await Promise.all([
      GradeModel.find(buildGradeFilter(filters)).sort({ studentId: 1 }).lean(),
      resolveMaps(),
    ]);

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Notas');
    ws.columns = [
      { header: 'Cedula', key: 'code', width: 16 },
      { header: 'Estudiante', key: 'student', width: 28 },
      { header: 'Grupo', key: 'group', width: 18 },
      { header: 'Materia', key: 'subject', width: 28 },
      { header: 'Componente', key: 'component', width: 18 },
      { header: 'Nota', key: 'score', width: 10 },
      { header: 'Corte', key: 'corte', width: 10 },
      { header: 'Semestre', key: 'period', width: 12 },
    ];
    excelSheetStyle(ws, 8);
    grades.forEach(grade => {
      const student = maps.students.get(String(grade.studentId));
      const subject = maps.subjects.get(String(grade.subjectId));
      const group = maps.groups.get(String(grade.groupId ?? ''));
      ws.addRow({
        code: student?.code ?? '',
        student: student?.fullName ?? '',
        group: group?.name ?? '',
        subject: `${subject?.code ?? ''} ${subject?.name ?? ''}`.trim(),
        component: grade.corte ? `C${grade.corte} ${grade.componentType ?? ''}`.trim() : (grade.component ?? ''),
        score: Number(grade.score ?? 0),
        corte: grade.corte ?? '',
        period: grade.period ?? '',
      });
    });

    const buffer = await wb.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="reporte-notas.xlsx"');
    res.send(Buffer.from(buffer));
  } catch (err) {
    next(err);
  }
});

reportsRouter.get('/excel/attendance', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'), async (req, res, next) => {
  try {
    const filters = filtersFromQuery(req.query, req.user);
    const [attendance, maps] = await Promise.all([
      AttendanceModel.find(buildAttendanceFilter(filters)).sort({ date: 1 }).lean(),
      resolveMaps(),
    ]);

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Asistencia');
    ws.columns = [
      { header: 'Cedula', key: 'code', width: 16 },
      { header: 'Estudiante', key: 'student', width: 28 },
      { header: 'Grupo', key: 'group', width: 18 },
      { header: 'Materia', key: 'subject', width: 28 },
      { header: 'Semestre', key: 'period', width: 12 },
      { header: 'Fecha', key: 'date', width: 14 },
      { header: 'Presente', key: 'present', width: 10 },
      { header: 'Observacion', key: 'notes', width: 26 },
    ];
    excelSheetStyle(ws, 8);
    attendance.forEach(row => {
      const student = maps.students.get(String(row.studentId));
      const subject = maps.subjects.get(String(row.subjectId));
      const group = maps.groups.get(String(row.groupId ?? ''));
      ws.addRow({
        code: student?.code ?? '',
        student: student?.fullName ?? '',
        group: group?.name ?? '',
        subject: `${subject?.code ?? ''} ${subject?.name ?? ''}`.trim(),
        period: row.period ?? '',
        date: formatDate(row.date),
        present: row.present ? 'Si' : 'No',
        notes: row.notes ?? '',
      });
    });

    const buffer = await wb.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="reporte-asistencia.xlsx"');
    res.send(Buffer.from(buffer));
  } catch (err) {
    next(err);
  }
});

reportsRouter.get('/excel/combined', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'), async (req, res, next) => {
  try {
    const filters = filtersFromQuery(req.query, req.user);
    const [grades, attendance, maps] = await Promise.all([
      GradeModel.find(buildGradeFilter(filters)).sort({ studentId: 1, subjectId: 1 }).lean(),
      AttendanceModel.find(buildAttendanceFilter(filters)).sort({ date: 1 }).lean(),
      resolveMaps(),
    ]);

    const wb = new ExcelJS.Workbook();
    const gradeWs = wb.addWorksheet('Notas');
    gradeWs.columns = [
      { header: 'Cedula', key: 'code', width: 16 },
      { header: 'Estudiante', key: 'student', width: 28 },
      { header: 'Grupo', key: 'group', width: 18 },
      { header: 'Materia', key: 'subject', width: 28 },
      { header: 'Componente', key: 'component', width: 18 },
      { header: 'Nota', key: 'score', width: 10 },
      { header: 'Corte', key: 'corte', width: 10 },
      { header: 'Semestre', key: 'period', width: 12 },
    ];
    excelSheetStyle(gradeWs, 8);

    const attendanceWs = wb.addWorksheet('Asistencia');
    attendanceWs.columns = [
      { header: 'Cedula', key: 'code', width: 16 },
      { header: 'Estudiante', key: 'student', width: 28 },
      { header: 'Grupo', key: 'group', width: 18 },
      { header: 'Materia', key: 'subject', width: 28 },
      { header: 'Semestre', key: 'period', width: 12 },
      { header: 'Fecha', key: 'date', width: 14 },
      { header: 'Presente', key: 'present', width: 10 },
      { header: 'Observacion', key: 'notes', width: 26 },
    ];
    excelSheetStyle(attendanceWs, 8);

    grades.forEach(grade => {
      const student = maps.students.get(String(grade.studentId));
      const subject = maps.subjects.get(String(grade.subjectId));
      const group = maps.groups.get(String(grade.groupId ?? ''));
      gradeWs.addRow({
        code: student?.code ?? '',
        student: student?.fullName ?? '',
        group: group?.name ?? '',
        subject: `${subject?.code ?? ''} ${subject?.name ?? ''}`.trim(),
        component: grade.corte ? `C${grade.corte} ${grade.componentType ?? ''}`.trim() : (grade.component ?? ''),
        score: Number(grade.score ?? 0),
        corte: grade.corte ?? '',
        period: grade.period ?? '',
      });
    });

    attendance.forEach(row => {
      const student = maps.students.get(String(row.studentId));
      const subject = maps.subjects.get(String(row.subjectId));
      const group = maps.groups.get(String(row.groupId ?? ''));
      attendanceWs.addRow({
        code: student?.code ?? '',
        student: student?.fullName ?? '',
        group: group?.name ?? '',
        subject: `${subject?.code ?? ''} ${subject?.name ?? ''}`.trim(),
        period: row.period ?? '',
        date: formatDate(row.date),
        present: row.present ? 'Si' : 'No',
        notes: row.notes ?? '',
      });
    });

    const buffer = await wb.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="reporte-academico.xlsx"');
    res.send(Buffer.from(buffer));
  } catch (err) {
    next(err);
  }
});
