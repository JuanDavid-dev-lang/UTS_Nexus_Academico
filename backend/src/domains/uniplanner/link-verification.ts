/**
 * Verificación automática del enlace de UniPlanner. Lógica pura, sin I/O.
 *
 * El estudiante se enlaza con tres datos: su universidad, su número de
 * documento y su nombre completo. Nexus los compara con su registro —el
 * estudiante con ese documento, matriculado en esa universidad, con ese
 * nombre— y si coinciden el enlace queda verificado sin que nadie tenga que
 * revisarlo a mano. Con miles de estudiantes, la revisión manual de cada
 * enlace no escalaba: queda para las excepciones (una solicitud, un cambio de
 * cuenta).
 *
 * **Qué garantiza y qué no.** Garantiza que los tres datos casan con un
 * estudiante real de esa universidad: un documento mal escrito, uno inventado o
 * el de alguien de otra universidad no se verifican. **No** prueba que quien lo
 * escribe sea esa persona: quien conozca el nombre completo y el documento de
 * un compañero puede escribirlos. Contra eso siguen las otras capas: un enlace
 * por cuenta, el vínculo del semestre (`CUENTA_CAMBIADA`), un teléfono por
 * cuenta y clase, y la vista previa con el nombre antes de confirmar.
 */

/** Estado que Nexus escribe en el enlace. Literales permanentes: los lee UniPlanner. */
export type EstadoVerificacion = 'verified' | 'not_matched';

/**
 * Un nombre de persona reducido a sus palabras, para compararlo.
 *
 * Sin tildes ni mayúsculas (`Pérez` = `PEREZ`), sin signos (`O'Neil` =
 * `ONEIL`, `Gómez-Pinzón` = `GOMEZ PINZON`) y **en cualquier orden**: la
 * universidad suele guardar primero los apellidos (`PÉREZ GÓMEZ JUAN CARLOS`) y
 * la persona escribe primero los nombres. La ñ se compara como n, igual en los
 * dos lados.
 */
export function palabrasDelNombre(texto: string): string[] {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/['’`´]/g, '')
    .replace(/[^A-Z]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .sort();
}

/**
 * Si dos nombres son el mismo nombre completo.
 *
 * **Todas** las palabras, ni una de más ni una de menos. Aceptar un nombre
 * parcial («Juan Pérez» para `JUAN CARLOS PÉREZ GÓMEZ`) haría que bastara con
 * el nombre de pila y el primer apellido, que es lo primero que sabe cualquiera
 * del salón.
 */
export function mismoNombre(escrito: string, registrado: string): boolean {
  const a = palabrasDelNombre(escrito);
  const b = palabrasDelNombre(registrado);
  return a.length >= 2 && a.length === b.length && a.every((palabra, i) => palabra === b[i]);
}

export type EnlaceAVerificar = {
  /** Clave de la universidad del enlace (`uts`). */
  institucion: string;
  /** Nombre completo que escribió la persona en UniPlanner. */
  nombre: string;
};

export type EstudianteRegistrado = {
  nombre: string;
  /** Claves de las universidades donde tiene matrícula. */
  instituciones: ReadonlySet<string>;
};

/**
 * Qué escribir en un enlace, o `null` si no hay que tocarlo.
 *
 * - Sin nombre (enlaces anteriores a esta verificación): nada. La app le pide
 *   a la persona que lo añada, y al añadirlo se vuelve a comprobar.
 * - Estudiante con ese documento, matriculado en esa universidad y con ese
 *   nombre: `verified`.
 * - Cualquier otra cosa: `not_matched`. **Un solo estado para «no existe»,
 *   «es de otra universidad» y «el nombre no coincide»**: distinguirlos le
 *   diría a quien prueba documentos cuáles son de estudiantes de verdad.
 */
export function decidirVerificacion(
  enlace: EnlaceAVerificar,
  estudiante: EstudianteRegistrado | null,
): EstadoVerificacion | null {
  if (palabrasDelNombre(enlace.nombre).length === 0) return null;
  if (!estudiante || !estudiante.instituciones.has(enlace.institucion)) return 'not_matched';
  return mismoNombre(enlace.nombre, estudiante.nombre) ? 'verified' : 'not_matched';
}
