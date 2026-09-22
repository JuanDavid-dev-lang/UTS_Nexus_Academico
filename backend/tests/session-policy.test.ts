import { describe, expect, it } from 'vitest';
import {
  PATRON_ID_DISPOSITIVO,
  dispositivoAutorizado,
} from '../src/domains/session/session-policy.js';

describe('dispositivoAutorizado', () => {
  it('deja renovar una sesión sin equipo, venga o no un identificador', () => {
    expect(dispositivoAutorizado(null, null)).toBe(true);
    expect(dispositivoAutorizado(undefined, 'abc')).toBe(true);
  });

  it('deja renovar desde el mismo equipo', () => {
    expect(dispositivoAutorizado('hash-a', 'hash-a')).toBe(true);
  });

  it('rechaza otro equipo', () => {
    expect(dispositivoAutorizado('hash-a', 'hash-b')).toBe(false);
  });

  it('rechaza omitir el identificador en una sesión atada a un equipo', () => {
    expect(dispositivoAutorizado('hash-a', null)).toBe(false);
    expect(dispositivoAutorizado('hash-a', undefined)).toBe(false);
  });
});

describe('PATRON_ID_DISPOSITIVO', () => {
  it('acepta un UUID y rechaza lo corto o con símbolos', () => {
    expect(PATRON_ID_DISPOSITIVO.test('3f0c9a52-7a4e-4f7e-9d7b-0f5f4b1f2c3d')).toBe(true);
    expect(PATRON_ID_DISPOSITIVO.test('corto')).toBe(false);
    expect(PATRON_ID_DISPOSITIVO.test('a'.repeat(20) + '$')).toBe(false);
    expect(PATRON_ID_DISPOSITIVO.test('a'.repeat(129))).toBe(false);
  });
});

