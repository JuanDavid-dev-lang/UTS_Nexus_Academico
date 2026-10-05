import { describe, expect, it } from 'vitest';
import {
  GRACIA_ROTACION_MS,
  PATRON_ID_DISPOSITIVO,
  dentroDeGraciaDeRotacion,
  dispositivoAutorizado,
  inicioDeGraciaDeRotacion,
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


describe('gracia de rotación del refresh token', () => {
  const ahora = Date.parse('2026-10-05T12:00:00Z');

  it('dura 30 s', () => {
    expect(GRACIA_ROTACION_MS).toBe(30_000);
  });

  it('acepta el token anterior justo después de rotar y en el borde', () => {
    expect(dentroDeGraciaDeRotacion(new Date(ahora - 1_000), ahora)).toBe(true);
    expect(dentroDeGraciaDeRotacion(new Date(ahora - GRACIA_ROTACION_MS), ahora)).toBe(true);
  });

  it('fuera de la ventana es reuso', () => {
    expect(dentroDeGraciaDeRotacion(new Date(ahora - GRACIA_ROTACION_MS - 1), ahora)).toBe(false);
  });

  it('una sesión sin marca de rotación (anterior a esto) nunca está en gracia', () => {
    expect(dentroDeGraciaDeRotacion(null, ahora)).toBe(false);
    expect(dentroDeGraciaDeRotacion(undefined, ahora)).toBe(false);
  });

  it('una rotación fechada en el futuro no cuenta', () => {
    expect(dentroDeGraciaDeRotacion(new Date(ahora + 5_000), ahora)).toBe(false);
  });

  it('el filtro de la ruta coincide con la decisión', () => {
    expect(inicioDeGraciaDeRotacion(ahora).getTime()).toBe(ahora - GRACIA_ROTACION_MS);
  });
});
