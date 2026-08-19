/**
 * Ciclo de vida de un periodo académico. **Lógica pura, sin base de datos.**
 *
 * Lo que decide esta unidad es cuándo una escritura académica es legítima, y
 * eso no puede vivir repartido por seis rutas: la ruta que se olvide de
 * preguntarlo seguirá guardando notas en un semestre cerrado, sin ningún
 * error, y el acta oficial dejará de coincidir con la base de datos. Que sea
 * pura permite fijar la regla con pruebas en vez de con disciplina.
 */

export type EstadoPeriodo = 'OPEN' | 'CLOSING' | 'CLOSED';

/**
 * Qué se bloquea al cerrar.
 *
 * **Notas, asistencia y matrículas** son el acta: una vez congelada la
 * fotografía, cambiarlas la desmiente. Se bloquean sin excepción.
 *
 * **Horarios y actividades siguen editables**, y es una decisión, no un
 * descuido: no forman parte del consolidado. Un horario es dónde y cuándo se
 * dictó una clase, y a un coordinador le puede hacer falta corregirlo un año
 * después para reconstruir un aula; una actividad es un enunciado con fecha.
 * Ninguno de los dos entra en la fotografía, así que bloquearlos solo
 * impediría arreglar datos sin proteger nada. Lo que sí se bloquea es la
 * asistencia asociada a esa clase, que es lo que cuenta para el porcentaje.
 */
export const ENTIDADES_BLOQUEADAS = ['grade', 'attendance', 'enrollment'] as const;
export type EntidadAcademica = (typeof ENTIDADES_BLOQUEADAS)[number];

/** Entidades que permanecen editables con el periodo cerrado. */
export const ENTIDADES_LIBRES = ['schedule', 'activity', 'calendar', 'announcement'] as const;

/**
 * Transiciones permitidas.
 *
 * `CLOSING → OPEN` existe para poder abortar un cierre que falló a medias sin
 * pasar por `CLOSED`: dejar un periodo atascado en `CLOSING` lo bloquearía
 * para siempre sin haber producido ninguna fotografía.
 */
const TRANSICIONES: Record<EstadoPeriodo, EstadoPeriodo[]> = {
  OPEN: ['CLOSING'],
  CLOSING: ['CLOSED', 'OPEN'],
  CLOSED: ['OPEN'],
};

export function transicionValida(desde: EstadoPeriodo, hasta: EstadoPeriodo): boolean {
  return TRANSICIONES[desde]?.includes(hasta) ?? false;
}

/**
 * ¿Se puede escribir esta entidad con el periodo en este estado?
 *
 * Un periodo que no existe en la colección se considera abierto: la
 * institución lleva semestres funcionando sin este registro y exigirlo
 * retroactivamente dejaría de golpe toda la aplicación en solo lectura.
 */
export function puedeEscribir(estado: EstadoPeriodo | null | undefined, entidad: string): boolean {
  if (!estado || estado === 'OPEN') return true;
  return !(ENTIDADES_BLOQUEADAS as readonly string[]).includes(entidad);
}

/** Mensaje que ve la persona. Explica el estado, no el código. */
export function mensajeDeBloqueo(periodo: string, estado: EstadoPeriodo): string {
  return estado === 'CLOSING'
    ? `El periodo ${periodo} está cerrándose. No se admiten cambios académicos mientras se genera la fotografía oficial.`
    : `El periodo ${periodo} está cerrado. Para modificar notas, asistencia o matrículas hay que reabrirlo desde la administración.`;
}

/**
 * Progreso del cierre en porcentaje entero.
 *
 * Con `total` en cero devuelve 0 y no 100: un cierre que aún no ha contado
 * cuánto trabajo tiene no está terminado, y mostrar «100 %» antes de empezar
 * es la forma más rápida de que alguien lo dé por bueno.
 */
export function porcentajeDeCierre(progreso: { total?: number; done?: number } | null | undefined): number {
  const total = Number(progreso?.total ?? 0);
  const hecho = Number(progreso?.done ?? 0);
  if (!Number.isFinite(total) || total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((hecho / total) * 100)));
}

/**
 * ¿Tiene forma de periodo? `2026-1` / `2026-2`.
 *
 * El formato se comprueba aquí y no con un `regex` suelto en cada ruta porque
 * un periodo mal escrito no da error: crea un semestre paralelo vacío, y las
 * notas que se guarden con él desaparecen de todos los listados.
 */
export function esPeriodoValido(valor: string): boolean {
  return /^\d{4}-[1-4]$/.test(valor);
}

/** Compara dos periodos cronológicamente. Útil para ordenar listados. */
export function compararPeriodos(a: string, b: string): number {
  const [anioA, cicloA] = a.split('-').map(Number);
  const [anioB, cicloB] = b.split('-').map(Number);
  if (anioA !== anioB) return anioA - anioB;
  return (cicloA ?? 0) - (cicloB ?? 0);
}
