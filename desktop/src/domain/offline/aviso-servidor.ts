/**
 * Qué se le dice a la persona cuando el servidor no contesta bien.
 *
 * En los equipos de los clientes salía «sin conexión con el servidor» o
 * «verifica que esté encendido», y se leía como «el servidor se cayó y se
 * perdió lo que hice». No es así: notas y asistencia pasan por la cola de
 * envíos y suben solas al volver. El aviso dice eso, con calma.
 *
 * Dos reglas:
 *  - **Solo para fallos del servidor o de la red** (sin respuesta, tiempo
 *    agotado, 5xx). Un 4xx es una respuesta del servidor —datos inválidos,
 *    periodo cerrado, sin permiso— y se enseña tal cual; una sesión rechazada
 *    (401) tampoco es esto.
 *  - **No prometer lo que no se hace.** En el escritorio la cola va a disco
 *    («en local»); en la web vive en memoria, así que se dice «en esta
 *    pestaña» y que no se cierre.
 */

/** Dónde queda lo que se escribió mientras el servidor no contesta. */
export type DondeSeGuarda = 'equipo' | 'pestana';

/** Lo mínimo de un `AppError` para decidir. */
export type FalloDeServidor = { kind: string; status?: number };

const TITULO = 'Hubo un problema en el servidor';

const DETALLE: Record<DondeSeGuarda, string> = {
  equipo: 'Tus cambios quedan en local y se subirán cuando se restablezcan los servicios.',
  pestana:
    'Tus cambios quedan guardados en esta pestaña y se subirán cuando se restablezcan los servicios. No la cierres hasta entonces.',
};

/** ¿Es un fallo del servidor o de la red, y no una respuesta suya? */
export function esFalloDelServidor(error: FalloDeServidor): boolean {
  if (error.kind === 'network' || error.kind === 'timeout' || error.kind === 'server') return true;
  return typeof error.status === 'number' && error.status >= 500;
}

export type Aviso = { titulo: string; detalle: string };

/** Aviso para una escritura que quedó en la cola por un fallo del servidor. */
export function avisoDeFalloDelServidor(donde: DondeSeGuarda): Aviso {
  return { titulo: TITULO, detalle: DETALLE[donde] };
}

/** El aviso en una sola frase, para una línea o un `title`. */
export function mensajeDeFalloDelServidor(donde: DondeSeGuarda): string {
  const { titulo, detalle } = avisoDeFalloDelServidor(donde);
  return `${titulo}. ${detalle}`;
}

/**
 * Aviso para una lectura que falló por el servidor.
 *
 * Con datos en pantalla (caché) no hay error que enseñar: se sigue viendo lo
 * último guardado con una nota discreta. Sin datos, se dice qué pasa y que se
 * reintenta solo, sin el rojo de un error.
 */
export function avisoDeLectura(hayDatos: boolean): Aviso {
  return hayDatos
    ? {
        titulo: 'Mostrando lo último guardado',
        detalle: 'Hubo un problema en el servidor. Se actualiza solo cuando se restablezcan los servicios.',
      }
    : {
        titulo: TITULO,
        detalle:
          'Esta información se cargará cuando se restablezcan los servicios. Lo que ya habías abierto sigue disponible.',
      };
}

/** Texto corto del estado de la barra superior sin servidor. */
export function etiquetaSinServidor(donde: DondeSeGuarda): string {
  return donde === 'equipo'
    ? 'Problema en el servidor · tus cambios se guardan en local'
    : 'Problema en el servidor · tus cambios se guardan en esta pestaña';
}
