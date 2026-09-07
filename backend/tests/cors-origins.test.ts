import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Estas pruebas fijan que la aplicación de escritorio pueda hablar con el
 * servidor **en los tres sistemas operativos**, no solo en el que se probó.
 *
 * El origen que envía la app lo decide Tauri y depende del sistema:
 * `http://tauri.localhost` en Windows y Android, `tauri://localhost` en Linux,
 * macOS e iOS. Mientras esa lista se escribía a mano en `CLIENT_ORIGIN`, la
 * instalación declaraba las dos formas de `tauri.localhost` y se dejaba
 * `tauri://localhost`: la versión de Windows funcionaba y **la de Linux no
 * podía iniciar sesión**.
 *
 * Ese fallo no se ve en ningún sitio. El navegador incrustado corta la
 * petición antes de enviarla, el servidor no registra nada porque no le llega
 * nada, y la app enseña «error de red» — que es lo mismo que enseña cuando el
 * servidor está apagado. Por eso está aquí y no en una comprobación manual.
 */

/** `env.CLIENT_ORIGIN` se captura al importar el módulo, así que hay que
 *  recargarlo con el entorno ya puesto. */
async function origenesCon(clientOrigin: string | undefined): Promise<string[] | '*'> {
  vi.resetModules();
  if (clientOrigin === undefined) delete process.env.CLIENT_ORIGIN;
  else process.env.CLIENT_ORIGIN = clientOrigin;
  const { origenesPermitidos } = await import('../src/shared/env.js');
  return origenesPermitidos();
}

const original = process.env.CLIENT_ORIGIN;

beforeEach(() => {
  delete process.env.CLIENT_ORIGIN;
});

afterEach(() => {
  if (original === undefined) delete process.env.CLIENT_ORIGIN;
  else process.env.CLIENT_ORIGIN = original;
  vi.resetModules();
});

describe('orígenes permitidos por CORS', () => {
  it('acepta a la app de escritorio en los tres sistemas', async () => {
    const origenes = await origenesCon('https://nexus.uts.edu.co');

    expect(origenes).toContain('http://tauri.localhost'); // Windows y Android
    expect(origenes).toContain('tauri://localhost'); // Linux, macOS e iOS
  });

  it('conserva los orígenes declarados por el despliegue', async () => {
    const origenes = await origenesCon('https://nexus.uts.edu.co,https://otra.uts.edu.co');

    expect(origenes).toContain('https://nexus.uts.edu.co');
    expect(origenes).toContain('https://otra.uts.edu.co');
  });

  it('no repite un origen que el despliegue ya declaró', async () => {
    const origenes = await origenesCon('https://nexus.uts.edu.co,tauri://localhost');

    const repetidos = (origenes as string[]).filter(o => o === 'tauri://localhost');
    expect(repetidos).toHaveLength(1);
  });

  it('descarta espacios y entradas vacías de la lista', async () => {
    const origenes = await origenesCon(' https://nexus.uts.edu.co , , https://otra.uts.edu.co ');

    expect(origenes).toContain('https://nexus.uts.edu.co');
    expect(origenes).toContain('https://otra.uts.edu.co');
    expect(origenes).not.toContain('');
  });

  it('deja pasar el comodín tal cual: fuera de producción vale, y allí no llega', async () => {
    // `validarProduccion()` rechaza `*` cuando NODE_ENV es production, así que
    // aquí solo se comprueba que en local no se convierta en una lista corta.
    expect(await origenesCon(undefined)).toBe('*');
    expect(await origenesCon('*')).toBe('*');
  });
});
