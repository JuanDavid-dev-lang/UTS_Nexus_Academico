import { describe, expect, it } from 'vitest';
import { expedienteSeguimientoSchema } from '@/domain/schemas/timeline';

describe('contrato del expediente de seguimiento', () => {
  it('acepta el estado integrado enviado por el backend', () => {
    const parsed = expedienteSeguimientoSchema.parse({
      student: { id: '1', code: '100', fullName: 'Ana Pérez', email: null, program: 'Sistemas' },
      context: { subjectId: null, subjectName: null, period: null },
      academic: [], followUp: { open: null, episodes: [], progress: null },
      timeline: { items: [], total: 0, page: 1, limit: 20, hasMore: false },
      allowedActions: ['OPEN_FOLLOW_UP'],
    });
    expect(parsed.student.email).toBeNull();
  });
});
