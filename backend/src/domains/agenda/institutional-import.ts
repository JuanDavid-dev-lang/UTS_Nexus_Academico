import { createHash } from 'node:crypto';

export type EstadoFilaImportacion = 'VALID' | 'CONFLICT' | 'DUPLICATE' | 'SKIPPED' | 'ERROR';
export type FilaCalendario = {
  row: number; status: EstadoFilaImportacion; selected: boolean; title: string; description: string;
  startDate: string; endDate: string; allDay: boolean; location: string; period: string;
  externalKey: string; messages: string[];
};

function clean(value: unknown): string { return String(value ?? '').trim(); }
function dateOnly(value: unknown): string | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString().slice(0, 10);
  const raw = clean(value);
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  const latin = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(raw);
  const candidate = iso ? raw : latin ? `${latin[3]}-${latin[2].padStart(2, '0')}-${latin[1].padStart(2, '0')}` : '';
  if (!candidate) return null;
  const date = new Date(`${candidate}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === candidate ? candidate : null;
}

export function externalKeyFor(row: Pick<FilaCalendario, 'title' | 'startDate' | 'endDate' | 'period'>): string {
  return createHash('sha256').update([row.title.toLocaleLowerCase('es'), row.startDate, row.endDate, row.period].join('|')).digest('hex');
}

export function normalizeCalendarRows(rows: Record<string, unknown>[]): FilaCalendario[] {
  const seen = new Set<string>();
  return rows.map((raw, index) => {
    const title = clean(raw.titulo ?? raw.title ?? raw.evento);
    const startDate = dateOnly(raw.fecha_inicio ?? raw.inicio ?? raw.fecha);
    const endDate = dateOnly(raw.fecha_fin ?? raw.fin ?? raw.fecha_inicio ?? raw.inicio ?? raw.fecha);
    const messages: string[] = [];
    if (!title) messages.push('Falta el título.');
    if (!startDate) messages.push('La fecha de inicio no es válida; usa AAAA-MM-DD o DD/MM/AAAA.');
    if (!endDate) messages.push('La fecha de fin no es válida.');
    if (startDate && endDate && endDate < startDate) messages.push('La fecha de fin es anterior al inicio.');
    const base = { title, startDate: startDate ?? '', endDate: endDate ?? '', period: clean(raw.periodo ?? raw.period) };
    const externalKey = externalKeyFor(base);
    let status: EstadoFilaImportacion = messages.length ? 'ERROR' : 'VALID';
    if (!title && !startDate && !clean(raw.descripcion ?? raw.description)) status = 'SKIPPED';
    if (status === 'VALID' && seen.has(externalKey)) { status = 'DUPLICATE'; messages.push('La fila está repetida dentro del archivo.'); }
    seen.add(externalKey);
    return {
      row: index + 2, status, selected: status === 'VALID', ...base, allDay: true,
      description: clean(raw.descripcion ?? raw.description), location: clean(raw.lugar ?? raw.location), externalKey, messages,
    };
  });
}

export function parseCsv(text: string): Record<string, string>[] {
  const records: string[][] = []; let record: string[] = []; let field = ''; let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"' && quoted && text[i + 1] === '"') { field += '"'; i++; }
    else if (c === '"') quoted = !quoted;
    else if ((c === ',' || c === ';') && !quoted) { record.push(field); field = ''; }
    else if ((c === '\n' || c === '\r') && !quoted) { if (c === '\r' && text[i + 1] === '\n') i++; record.push(field); if (record.some(v => v.trim())) records.push(record); record = []; field = ''; }
    else field += c;
  }
  record.push(field); if (record.some(v => v.trim())) records.push(record);
  const headers = (records.shift() ?? []).map(h => h.trim().toLocaleLowerCase('es').replace(/\s+/g, '_'));
  return records.map(values => Object.fromEntries(headers.map((header, i) => [header, values[i] ?? ''])));
}



