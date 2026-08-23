import { describe, expect, it } from 'vitest';
import { normalizeCalendarRows, parseCsv } from '../src/domains/agenda/institutional-import.js';

describe('importación de calendario institucional', () => {
  it('lee CSV citado y normaliza fechas sin zona horaria', () => {
    const rows = normalizeCalendarRows(parseCsv('titulo,fecha_inicio,fecha_fin,descripcion\n"Semana, cultural",10/09/2026,12/09/2026,"Arte, música"'));
    expect(rows[0]).toMatchObject({ title: 'Semana, cultural', startDate: '2026-09-10', endDate: '2026-09-12', status: 'VALID' });
  });
  it('marca duplicados, filas vacías y fechas imposibles', () => {
    const rows = normalizeCalendarRows([{ titulo: 'Grados', fecha: '2026-02-30' }, {}, { titulo: 'A', fecha: '2026-08-10' }, { titulo: 'A', fecha: '2026-08-10' }]);
    expect(rows.map(r => r.status)).toEqual(['ERROR', 'SKIPPED', 'VALID', 'DUPLICATE']);
  });
});
