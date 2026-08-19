/**
 * Estado de una actividad. **Lógica pura, sin base de datos.**
 *
 * La decisión que fija esta unidad es que `LATE` **no se persiste**. Guardarlo
 * obligaría a un proceso que recorriera todas las actividades cada minuto para
 * pasar de `OPEN` a `LATE` en el instante justo; cualquier fallo de ese proceso
 * —una instancia caída, un intervalo mal configurado, un despliegue a mitad de
 * semana— dejaría actividades vencidas presentándose como abiertas, y nadie
 * tendría forma de notarlo porque la pantalla no miente: muestra lo guardado.
 *
 * Un estado que depende únicamente del reloj se deriva al leer. Lo que se
 * guarda es la decisión de una persona (`OPEN` / `CLOSED`); lo que cuenta el
 * calendario se calcula.
 */

/** Lo que se guarda: una decisión de alguien. */
export type EstadoPersistido = 'OPEN' | 'CLOSED';

/** Lo que se muestra: la decisión más lo que dice el reloj. */
export type EstadoDerivado = 'OPEN' | 'CLOSED' | 'LATE';

/**
 * Umbrales de aviso, en horas antes del vencimiento.
 *
 * Están aquí, en el dominio, y no repartidos entre el escáner y los dos
 * clientes: la antelación forma parte de la clave de deduplicación de la
 * notificación, así que dos listas distintas producirían avisos duplicados
 * que el `dedupeKey` no reconocería como el mismo hecho.
 *
 * Tres escalones y no más: a 48 h todavía se puede planificar, a 24 h se
 * organiza el día, a 2 h es el último recordatorio útil. Un cuarto aviso
 * enseña a ignorar los tres anteriores.
 */
export const ANTELACIONES_HORAS = [48, 24, 2] as const;
export type AntelacionHoras = (typeof ANTELACIONES_HORAS)[number];

/**
 * Estado visible de una actividad.
 *
 * `CLOSED` manda sobre el reloj: una actividad que el docente cerró está
 * cerrada aunque la fecha ya hubiera pasado, porque cerrarla es precisamente
 * la respuesta a que venciera.
 */
export function derivarEstado(
  estado: EstadoPersistido | 'LATE' | null | undefined,
  dueAt: Date | string | number,
  ahora: Date = new Date(),
): EstadoDerivado {
  if (estado === 'CLOSED') return 'CLOSED';
  const limite = dueAt instanceof Date ? dueAt : new Date(dueAt);
  if (Number.isNaN(limite.getTime())) return 'OPEN';
  return limite.getTime() < ahora.getTime() ? 'LATE' : 'OPEN';
}

/** ¿Sigue abierta y ya venció? Es lo que dispara el aviso de «vencida». */
export function estaVencida(
  estado: EstadoPersistido | 'LATE' | null | undefined,
  dueAt: Date | string | number,
  ahora: Date = new Date(),
): boolean {
  return derivarEstado(estado, dueAt, ahora) === 'LATE';
}

/**
 * Antelaciones que corresponde avisar ahora mismo para una actividad.
 *
 * Devuelve las que **acaban de entrar en su ventana**, no todas las que ya
 * pasaron: sin esa distinción, la actividad de dentro de una hora dispararía
 * los tres avisos a la vez, uno detrás de otro, en la misma pasada.
 *
 * La ventana es el intervalo entre pasadas del escáner. Con pasadas cada 15
 * minutos, la de 24 h se dispara alguna vez entre 24:00 y 23:45 antes del
 * vencimiento, que es la precisión que un aviso de un día antes necesita.
 */
export function antelacionesADisparar(
  dueAt: Date | string | number,
  ahora: Date,
  ventanaMinutos: number,
): AntelacionHoras[] {
  const limite = dueAt instanceof Date ? dueAt : new Date(dueAt);
  if (Number.isNaN(limite.getTime())) return [];

  const faltanMinutos = (limite.getTime() - ahora.getTime()) / 60000;
  if (faltanMinutos < 0) return [];

  return ANTELACIONES_HORAS.filter(horas => {
    const objetivo = horas * 60;
    // Entra en ventana cuando quedan menos que la antelación pero no menos que
    // la antelación menos una pasada: exactamente una vez por antelación.
    return faltanMinutos <= objetivo && faltanMinutos > objetivo - ventanaMinutos;
  });
}

/**
 * Clave de deduplicación de un aviso.
 *
 * Identifica el HECHO —«esta actividad, este aviso»— y no el documento de la
 * notificación. Sin ella el escáner crea un aviso idéntico en cada pasada, que
 * es la forma más rápida de enseñar a un docente a ignorar la campana.
 */
export function claveAviso(actividadId: string, tipo: AntelacionHoras | 'vencida'): string {
  return `activity:${actividadId}:${tipo === 'vencida' ? 'vencida' : `${tipo}h`}`;
}

/** Texto del aviso según la antelación. La cifra la pone quien llama. */
export function textoAntelacion(horas: AntelacionHoras): string {
  if (horas >= 24) {
    const dias = Math.round(horas / 24);
    return dias === 1 ? 'mañana' : `en ${dias} días`;
  }
  return `en ${horas} horas`;
}
