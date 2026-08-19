/**
 * Versión del backend, en un solo sitio.
 *
 * Se lee de `package.json` al arrancar y no se escribe a mano: dos números de
 * versión que hay que acordarse de subir a la vez acaban siendo dos números
 * distintos, y el centro de salud informaría de una versión que no es la que
 * está corriendo.
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function leerVersion(): string {
  try {
    const paquete = require('../../package.json') as { version?: string };
    return String(paquete.version ?? '0.0.0');
  } catch {
    // En el build compilado el `package.json` queda un nivel más arriba; si
    // tampoco está, la versión desconocida es preferible a un arranque roto.
    return '0.0.0';
  }
}

export const APP_VERSION = leerVersion();
