import { describe, expect, it } from 'vitest';
import {
  ESPERA_ENTRE_RECARGAS_MS,
  debeRecargar,
  esFalloDeCargaDeModulo,
} from '@/domain/platform/version-nueva';

describe('esFalloDeCargaDeModulo', () => {
  it('reconoce el trozo perdido en los tres motores y en Vite', () => {
    const mensajes = [
      'Failed to fetch dynamically imported module: https://x/assets/grades-page-AB12.js',
      'error loading dynamically imported module: https://x/assets/a.js',
      'Importing a module script failed.',
      'Unable to preload CSS for /assets/index-1.css',
      "Failed to load module script: Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of \"text/html\"",
    ];
    for (const m of mensajes) expect(esFalloDeCargaDeModulo(new Error(m))).toBe(true);
    expect(esFalloDeCargaDeModulo(mensajes[0])).toBe(true);
  });

  it('no confunde un error de la aplicación con un despliegue nuevo', () => {
    expect(esFalloDeCargaDeModulo(new TypeError("Cannot read properties of undefined (reading 'map')"))).toBe(false);
    expect(esFalloDeCargaDeModulo(null)).toBe(false);
    expect(esFalloDeCargaDeModulo({ message: 'Failed to fetch dynamically imported module' })).toBe(false);
  });
});

describe('debeRecargar', () => {
  const ahora = 1_800_000_000_000;

  it('recarga la primera vez', () => {
    expect(debeRecargar(null, ahora)).toBe(true);
    expect(debeRecargar(Number.NaN, ahora)).toBe(true);
  });

  it('no recarga en bucle si el trozo sigue sin llegar', () => {
    expect(debeRecargar(ahora - 1_000, ahora)).toBe(false);
    expect(debeRecargar(ahora - ESPERA_ENTRE_RECARGAS_MS, ahora)).toBe(true);
  });
});
