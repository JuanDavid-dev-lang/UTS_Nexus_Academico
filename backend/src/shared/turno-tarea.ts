/**
 * Turno de una tarea periódica entre varias instancias. Puro, sin I/O.
 *
 * Cada proceso del backend arranca todas las tareas (`server.ts`). Con dos
 * servidores —o un contenedor de pruebas apuntando a Atlas— cada recordatorio
 * de clase, cada aviso y cada verificación de UniPlanner se ejecutaba una vez
 * por instancia. Se vio en producción el 13 de noviembre de 2026: tres hosts
 * distintos anotando la misma tarea.
 *
 * El turno es un lease en `ejecuciones_tareas`: una instancia lo toma y lo
 * renueva en cada pasada; las demás se saltan la tarea mientras siga vigente.
 * Es «pegajoso» a propósito: quien lo tiene lo conserva mientras siga viva, y
 * solo si deja de renovarlo durante varios intervalos lo toma otra. Soltarlo al
 * terminar cada pasada dejaría a las instancias alternándose y, con relojes de
 * intervalo desfasados, ejecutando las dos.
 */

const MS_MINUTO = 60_000;

/** Turno mínimo: una tarea de cada minuto no puede perderlo por un GC largo. */
export const TURNO_MINIMO_MS = 3 * MS_MINUTO;

/** Turno cuando no se conoce el intervalo (tarea desactivada o sin dato). */
export const TURNO_POR_DEFECTO_MS = 10 * MS_MINUTO;

/**
 * Cuánto dura el turno de una tarea que corre cada `intervaloMin` minutos.
 *
 * Dos intervalos y medio: sobrevive a una pasada lenta o a un arranque
 * escalonado, y si la instancia que lo tiene muere, otra lo recoge sin esperar
 * mucho más de lo que tardaría la siguiente pasada.
 */
export function duracionDelTurnoMs(intervaloMin: number): number {
  if (!Number.isFinite(intervaloMin) || intervaloMin <= 0) return TURNO_POR_DEFECTO_MS;
  return Math.max(TURNO_MINIMO_MS, Math.round(intervaloMin * 2.5 * MS_MINUTO));
}

/**
 * Filtro con el que una instancia reclama el turno: libre, vencido o ya suyo.
 *
 * Se usa en un `findOneAndUpdate` con `upsert`: si el turno lo tiene otra
 * instancia, el filtro no casa, el upsert intenta crear un segundo documento
 * con el mismo `job` y el índice único lo rechaza con E11000. Ese rechazo es
 * la respuesta «no te toca».
 */
export function filtroDeTurno(job: string, quien: string, ahora: Date): Record<string, unknown> {
  return {
    job,
    $or: [
      { leaseUntil: null },
      { leaseUntil: { $exists: false } },
      { leaseUntil: { $lte: ahora } },
      { leaseHolder: quien },
    ],
  };
}
