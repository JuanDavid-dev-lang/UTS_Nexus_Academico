import { describe, expect, it } from 'vitest';
import {
  errorDeFechasDeAviso,
  estadoDeAviso,
  puedeMoverPublicacion,
} from '../src/domains/announcements/announcement-status.js';

const AHORA = new Date('2026-11-25T15:00:00Z');

describe('estadoDeAviso', () => {
  it('con publicación futura es PROGRAMADO, aunque tenga caducidad', () => {
    expect(estadoDeAviso({ publicadoEn: '2026-11-26T13:00:00Z', expiraEn: '2026-12-01T00:00:00Z' }, AHORA)).toBe(
      'PROGRAMADO',
    );
  });

  it('publicado y sin caducar es VIGENTE', () => {
    expect(estadoDeAviso({ publicadoEn: '2026-11-20T13:00:00Z', expiraEn: null }, AHORA)).toBe('VIGENTE');
    expect(estadoDeAviso({ publicadoEn: AHORA, expiraEn: '2026-11-30T00:00:00Z' }, AHORA)).toBe('VIGENTE');
  });

  it('con la caducidad alcanzada es CADUCADO', () => {
    expect(estadoDeAviso({ publicadoEn: '2026-11-01T00:00:00Z', expiraEn: AHORA }, AHORA)).toBe('CADUCADO');
  });
});

describe('errorDeFechasDeAviso', () => {
  it('exige caducidad posterior a la publicación', () => {
    const publicado = new Date('2026-11-26T13:00:00Z');
    expect(errorDeFechasDeAviso(publicado, null)).toBeNull();
    expect(errorDeFechasDeAviso(publicado, new Date('2026-11-27T00:00:00Z'))).toBeNull();
    expect(errorDeFechasDeAviso(publicado, publicado)).not.toBeNull();
  });
});

describe('puedeMoverPublicacion', () => {
  it('solo un aviso que aún no salió se reprograma', () => {
    expect(puedeMoverPublicacion('PROGRAMADO')).toBe(true);
    expect(puedeMoverPublicacion('VIGENTE')).toBe(false);
    expect(puedeMoverPublicacion('CADUCADO')).toBe(false);
  });
});
