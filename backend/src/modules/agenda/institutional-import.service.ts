import ExcelJS from 'exceljs';
import { randomUUID } from 'node:crypto';
import { Types } from 'mongoose';
import { CalendarEventModel } from '../../models/calendar-event.model.js';
import { auditBatch } from '../../shared/audit.js';
import { env } from '../../shared/env.js';
import { normalizeCalendarRows, parseCsv, type FilaCalendario } from '../../domains/agenda/institutional-import.js';

export async function readInstitutionalFile(file: Express.Multer.File): Promise<Record<string, unknown>[]> {
  const name = file.originalname.toLowerCase();
  if (name.endsWith('.pdf') || file.mimetype === 'application/pdf') {
    const error = new Error('PDF beta aún no está habilitado: conviértelo a CSV o Excel para evitar interpretar fechas incorrectamente.') as Error & { statusCode?: number };
    error.statusCode = 422; throw error;
  }
  if (name.endsWith('.csv') || file.mimetype.includes('csv') || file.mimetype === 'text/plain') {
    return parseCsv(file.buffer.toString('utf8').replace(/^\uFEFF/, ''));
  }
  if (name.endsWith('.xlsx')) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(file.buffer as unknown as ExcelJS.Buffer);
    const sheet = workbook.worksheets[0];
    if (!sheet) return [];
    const headers: string[] = [];
    sheet.getRow(1).eachCell((cell, col) => { headers[col - 1] = String(cell.text).trim().toLocaleLowerCase('es').replace(/\s+/g, '_'); });
    const rows: Record<string, unknown>[] = [];
    sheet.eachRow((row, number) => {
      if (number === 1) return;
      const item: Record<string, unknown> = {};
      headers.forEach((header, i) => { item[header] = row.getCell(i + 1).value instanceof Date ? row.getCell(i + 1).value : row.getCell(i + 1).text; });
      rows.push(item);
    });
    return rows;
  }
  const error = new Error('Formato no compatible. Usa CSV o XLSX.') as Error & { statusCode?: number };
  error.statusCode = 415; throw error;
}

export async function previewInstitutionalCalendar(file: Express.Multer.File) {
  const rows = normalizeCalendarRows(await readInstitutionalFile(file)).slice(0, 1000);
  const keys = rows.filter(r => r.status === 'VALID').map(r => r.externalKey);
  const existing = new Set((await CalendarEventModel.find({ externalKey: { $in: keys }, deletedAt: null }).select('externalKey').lean()).map(e => String(e.externalKey)));
  for (const row of rows) if (row.status === 'VALID' && existing.has(row.externalKey)) { row.status = 'CONFLICT'; row.selected = false; row.messages.push('Ya existe un evento institucional con los mismos datos.'); }
  const summary = rows.reduce<Record<string, number>>((out, row) => ({ ...out, [row.status]: (out[row.status] ?? 0) + 1 }), { VALID: 0, CONFLICT: 0, DUPLICATE: 0, SKIPPED: 0, ERROR: 0 });
  return { rows, summary, source: file.originalname, capability: { csv: true, excel: true, pdf: false, pdfMessage: 'Convierte el PDF a CSV o Excel; la beta no adivina tablas escaneadas.' } };
}

function campusDate(date: string, plusDays = 0): Date {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + plusDays, 0, -env.CAMPUS_UTC_OFFSET_MIN));
}

export async function confirmInstitutionalCalendar(actorId: string, selectedRows: FilaCalendario[]) {
  const normalized = normalizeCalendarRows(selectedRows.map(row => ({ titulo: row.title, descripcion: row.description, fecha_inicio: row.startDate, fecha_fin: row.endDate, lugar: row.location, periodo: row.period })));
  const eligible = normalized.filter(row => row.status === 'VALID');
  const batchId = randomUUID();
  if (!eligible.length) return { created: 0, omitted: selectedRows.length, importBatchId: batchId };
  const result = await CalendarEventModel.bulkWrite(eligible.map(row => ({
    updateOne: {
      filter: { externalKey: row.externalKey, deletedAt: null },
      update: { $setOnInsert: { title: row.title, description: row.description, type: 'ACADEMIC', visibility: 'INSTITUTIONAL', teacherId: null, startAt: campusDate(row.startDate), endAt: campusDate(row.endDate, 1), allDay: true, location: row.location, priority: 'MEDIUM', reminderMinutes: [], period: row.period, createdBy: new Types.ObjectId(actorId), importBatchId: batchId, externalKey: row.externalKey } },
      upsert: true,
    },
  })), { ordered: false });
  const created = result.upsertedCount;
  await auditBatch(eligible.map(row => ({ actorId, action: 'IMPORT', entity: 'EventoCalendario', entityId: row.externalKey, after: { ...row, importBatchId: batchId } })));
  return { created, omitted: selectedRows.length - created, importBatchId: batchId };
}

