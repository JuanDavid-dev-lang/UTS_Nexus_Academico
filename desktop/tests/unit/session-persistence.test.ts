import { beforeEach, describe, expect, it } from 'vitest';
import { tokenService } from '@/core/auth/token.service';
import { __reiniciarIdDelEquipoParaPruebas, idDelEquipo } from '@/core/auth/device-id';

/**
 * «Mantener la sesión iniciada» y la atadura al equipo.
 *
 * Fuera de Tauri el almacén seguro cae a `sessionStorage` (`platform/tauri.ts`),
 * así que lo que se afirma aquí es exactamente lo que queda guardado.
 */
const guardado = (clave: string) => sessionStorage.getItem(`uts.${clave}`);

beforeEach(() => {
  sessionStorage.clear();
  tokenService.__resetForTests();
  __reiniciarIdDelEquipoParaPruebas();
});

describe('mantener la sesión iniciada', () => {
  it('guarda los tokens cuando se pide recordar', async () => {
    await tokenService.set({ accessToken: 'a', refreshToken: 'r' }, { persistir: true });
    expect(guardado('refresh_token')).toBe('r');
    expect(tokenService.seGuarda()).toBe(true);
  });

  it('sin recordar no deja nada en el almacén, ni lo de una sesión anterior', async () => {
    await tokenService.set({ accessToken: 'viejo', refreshToken: 'viejo' });
    await tokenService.set({ accessToken: 'a', refreshToken: 'r' }, { persistir: false });

    expect(guardado('access_token')).toBeNull();
    expect(guardado('refresh_token')).toBeNull();
    expect(tokenService.getRefreshToken()).toBe('r');
  });

  it('una renovación conserva la elección: sin recordar no empieza a guardar', async () => {
    await tokenService.set({ accessToken: 'a', refreshToken: 'r1' }, { persistir: false });
    // Así llama el cliente HTTP al rotar el token: sin opciones.
    await tokenService.set({ accessToken: 'b', refreshToken: 'r2' });

    expect(guardado('refresh_token')).toBeNull();
    expect(tokenService.getRefreshToken()).toBe('r2');
  });
});

describe('identificador del equipo', () => {
  it('se genera una vez y se reutiliza en el siguiente arranque', async () => {
    const primero = await idDelEquipo();
    __reiniciarIdDelEquipoParaPruebas();
    expect(await idDelEquipo()).toBe(primero);
    expect(primero).toMatch(/^[A-Za-z0-9_-]{16,128}$/);
  });

  it('dos peticiones a la vez reciben el mismo identificador', async () => {
    const [a, b] = await Promise.all([idDelEquipo(), idDelEquipo()]);
    expect(a).toBe(b);
  });

  it('cerrar sesión no lo borra: es del equipo, no de la sesión', async () => {
    const id = await idDelEquipo();
    await tokenService.clear();
    expect(guardado('device_id')).toBe(id);
  });
});
