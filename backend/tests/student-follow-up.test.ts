import { describe, expect, it } from 'vitest';
import { presentarEpisodiosSeguimiento } from '../src/modules/timeline/timeline.service.js';

describe('expediente de seguimiento', () => {
  const casos = [{ seguimientos: [{
    _id: 'episodio-1', accion: 'LLAMADA', estado: 'EN_CURSO',
    creadoEn: '2026-08-20T12:00:00.000Z', nivelAlCrear: 'ALTO',
    nota: 'Información privada del docente', notaCierre: 'Otra nota privada',
  }] }];

  it('oculta notas internas en la representación para estudiantes', () => {
    const [episodio] = presentarEpisodiosSeguimiento(casos, true);
    expect(episodio).not.toHaveProperty('note');
    expect(episodio).not.toHaveProperty('closingNote');
  });

  it('conserva las notas para roles de acompañamiento', () => {
    const [episodio] = presentarEpisodiosSeguimiento(casos, false);
    expect(episodio.note).toBe('Información privada del docente');
  });
});
