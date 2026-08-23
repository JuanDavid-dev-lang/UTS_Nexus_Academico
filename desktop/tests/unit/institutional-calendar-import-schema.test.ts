import { describe, expect, it } from 'vitest';
import { institutionalPreviewSchema } from '@/domain/schemas/agenda';

describe('contrato de previsualización del calendario institucional', () => {
  it('conserva estados, mensajes y capacidad PDF explícita', () => {
    const result = institutionalPreviewSchema.parse({
      ok: true, source: 'calendario.csv', summary: { VALID: 1 },
      capability: { csv: true, excel: true, pdf: false, pdfMessage: 'No disponible' },
      rows: [{ row: 2, status: 'VALID', selected: true, title: 'Grados', description: '', startDate: '2026-09-10', endDate: '2026-09-10', allDay: true, location: '', period: '2026-2', externalKey: 'abc', messages: [] }],
    });
    expect(result.rows[0]!.status).toBe('VALID');
    expect(result.capability.pdf).toBe(false);
  });
});

