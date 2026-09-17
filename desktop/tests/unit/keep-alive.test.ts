import { describe, expect, it } from 'vitest';
import { debeRenovarSesion, RENOVAR_TRAS_MS } from '@/domain/session/keep-alive';

const AHORA = Date.UTC(2026, 8, 17, 12);
const segundos = (ms: number) => Math.floor(ms / 1000);

describe('mantener la sesión', () => {
  it('renueva un refresh token de más de un día', () => {
    const iat = segundos(AHORA - RENOVAR_TRAS_MS - 1000);
    expect(debeRenovarSesion({ iat, exp: iat + 30 * 86400 }, AHORA)).toBe(true);
  });

  it('no renueva uno recién emitido: sería una petición al servidor por nada', () => {
    const iat = segundos(AHORA - 60 * 60 * 1000);
    expect(debeRenovarSesion({ iat, exp: iat + 30 * 86400 }, AHORA)).toBe(false);
  });

  it('no toca uno ya caducado: lo explica el flujo del 401, no una tarea de fondo', () => {
    const iat = segundos(AHORA - 40 * 86400 * 1000);
    expect(debeRenovarSesion({ iat, exp: iat + 30 * 86400 }, AHORA)).toBe(false);
  });

  it('sin token legible no hace nada', () => {
    expect(debeRenovarSesion(null, AHORA)).toBe(false);
    expect(debeRenovarSesion({}, AHORA)).toBe(false);
  });
});
