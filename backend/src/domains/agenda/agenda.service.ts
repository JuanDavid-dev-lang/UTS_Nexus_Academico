/**
 * Motor de agenda — puro, sin I/O.
 *
 * Convierte el horario semanal que ya guarda `ScheduleModel` (día de la semana
 * + "HH:mm") en ocurrencias con fecha y hora absolutas, que es lo único con lo
 * que un calendario, un contador de "comienza en 25 minutos" y un recordatorio
 * pueden trabajar.
 *
 * ── Por qué un desfase explícito y no `new Date(...)` local ──────────────────
 * "10:00" en un horario significa las diez de la mañana en el campus, no las
 * diez del reloj del servidor. El backend puede estar en un contenedor en UTC y
 * el teléfono del docente en UTC-5: si la hora se resolviera con la zona del
 * proceso, la misma clase saldría a las 10:00 en un sitio y a las 05:00 en el
 * otro, y el recordatorio llegaría cinco horas tarde. Aquí el desfase entra
 * como parámetro, se aplica una sola vez y todo lo que sale son instantes UTC
 * absolutos que cualquier cliente puede formatear en su zona.
 *
 * Colombia no tiene horario de verano, así que un desfase fijo es correcto todo
 * el año. Si algún día hay que soportar un campus con DST, este es el único
 * archivo que cambia.
 */

/** Lunes = 1 … Domingo = 7 (ISO 8601, igual que `ScheduleModel.dayOfWeek`). */
export type DiaSemana = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** Lo mínimo que necesita una franja del horario para poder expandirse. */
export type FranjaSemanal = {
  id: string;
  dayOfWeek: number;
  /** 'HH:mm' en hora del campus. */
  startTime: string;
  /** 'HH:mm' en hora del campus. Si es inválida se usa `durationMinutes`. */
  endTime?: string;
  durationMinutes?: number;
};

export type Ocurrencia<T extends FranjaSemanal = FranjaSemanal> = {
  /** Identidad estable de "esta franja en esta fecha". Es la clave de dedupe. */
  id: string;
  franjaId: string;
  /** Fecha local del campus, 'YYYY-MM-DD'. */
  fecha: string;
  startAt: Date;
  endAt: Date;
  durationMinutes: number;
  franja: T;
};

export type EstadoClase = 'TERMINADA' | 'EN_CURSO' | 'PROXIMA';

const MS_MINUTO = 60_000;
const MS_DIA = 86_400_000;

/** Tope de seguridad: nadie pide un calendario de más de un año de golpe. */
const MAX_DIAS_EXPANDIDOS = 400;

/** 'HH:mm' → minutos desde medianoche. `null` si el formato no sirve. */
export function minutosDesdeMedianoche(hora: string | undefined | null): number | null {
  if (typeof hora !== 'string') return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(hora.trim());
  if (!match) return null;
  const horas = Number(match[1]);
  const minutos = Number(match[2]);
  if (horas < 0 || horas > 23 || minutos < 0 || minutos > 59) return null;
  return horas * 60 + minutos;
}

/** Minutos desde medianoche → 'HH:mm'. */
export function aHoraTexto(minutos: number): string {
  const normalizado = ((Math.round(minutos) % 1440) + 1440) % 1440;
  const horas = Math.floor(normalizado / 60);
  const resto = normalizado % 60;
  return `${String(horas).padStart(2, '0')}:${String(resto).padStart(2, '0')}`;
}

/** Partes del día en hora del campus para un instante UTC dado. */
export function diaLocal(
  instante: Date,
  offsetMinutos: number,
): { anio: number; mes: number; dia: number; diaSemana: DiaSemana; fecha: string } {
  const desplazado = new Date(instante.getTime() + offsetMinutos * MS_MINUTO);
  const anio = desplazado.getUTCFullYear();
  const mes = desplazado.getUTCMonth() + 1;
  const dia = desplazado.getUTCDate();
  // getUTCDay(): 0 = domingo. ISO quiere 7.
  const dow = desplazado.getUTCDay();
  return {
    anio,
    mes,
    dia,
    diaSemana: (dow === 0 ? 7 : dow) as DiaSemana,
    fecha: `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`,
  };
}

/** Instante UTC de una hora de pared del campus. */
export function instanteLocal(
  anio: number,
  mes: number,
  dia: number,
  minutosDelDia: number,
  offsetMinutos: number,
): Date {
  return new Date(Date.UTC(anio, mes - 1, dia, 0, 0, 0, 0) + (minutosDelDia - offsetMinutos) * MS_MINUTO);
}

/** Medianoche local del campus, como instante UTC. */
export function inicioDiaLocal(instante: Date, offsetMinutos: number): Date {
  const { anio, mes, dia } = diaLocal(instante, offsetMinutos);
  return instanteLocal(anio, mes, dia, 0, offsetMinutos);
}

/** Medianoche local del lunes de la semana de `instante`. */
export function inicioSemanaLocal(instante: Date, offsetMinutos: number): Date {
  const { diaSemana } = diaLocal(instante, offsetMinutos);
  const lunes = new Date(inicioDiaLocal(instante, offsetMinutos).getTime() - (diaSemana - 1) * MS_DIA);
  return lunes;
}

/** Medianoche local del día 1 del mes de `instante`. */
export function inicioMesLocal(instante: Date, offsetMinutos: number): Date {
  const { anio, mes } = diaLocal(instante, offsetMinutos);
  return instanteLocal(anio, mes, 1, 0, offsetMinutos);
}

/**
 * Duración efectiva de una franja.
 *
 * `endTime` manda cuando es coherente. Si falta o es anterior al inicio —dato
 * viejo, o alguien tecleó 09:00–08:00— se cae a `durationMinutes`, que es el
 * campo que el modelo garantiza con valor por defecto. Devolver 0 dejaría una
 * clase de duración nula que ni se ve en el calendario ni dispara avisos.
 */
export function duracionEfectiva(franja: FranjaSemanal): number {
  const inicio = minutosDesdeMedianoche(franja.startTime);
  const fin = minutosDesdeMedianoche(franja.endTime);
  if (inicio !== null && fin !== null && fin > inicio) return fin - inicio;
  const declarada = Number(franja.durationMinutes ?? 0);
  return declarada > 0 ? declarada : 90;
}

/**
 * Expande las franjas semanales a ocurrencias concretas dentro de [desde, hasta).
 *
 * Se incluye una ocurrencia si SOLAPA el rango, no si empieza dentro: la clase
 * que arrancó a las 9:50 sigue estando en curso a las 10:00 y tiene que
 * aparecer cuando se pide "lo de ahora".
 */
export function expandirFranjas<T extends FranjaSemanal>(
  franjas: readonly T[],
  desde: Date,
  hasta: Date,
  offsetMinutos: number,
): Ocurrencia<T>[] {
  if (!(desde instanceof Date) || !(hasta instanceof Date)) return [];
  if (!Number.isFinite(desde.getTime()) || !Number.isFinite(hasta.getTime())) return [];
  if (hasta.getTime() <= desde.getTime()) return [];

  const porDia = new Map<number, T[]>();
  for (const franja of franjas) {
    const dia = Number(franja.dayOfWeek);
    if (!Number.isInteger(dia) || dia < 1 || dia > 7) continue;
    if (minutosDesdeMedianoche(franja.startTime) === null) continue;
    const lista = porDia.get(dia);
    if (lista) lista.push(franja);
    else porDia.set(dia, [franja]);
  }
  if (porDia.size === 0) return [];

  // Se empieza un día antes: una clase que cruza la medianoche (rara, pero el
  // modelo no lo impide) tiene que poder solapar el inicio del rango.
  const primerDia = new Date(inicioDiaLocal(desde, offsetMinutos).getTime() - MS_DIA);
  const resultado: Ocurrencia<T>[] = [];

  for (let indice = 0; indice < MAX_DIAS_EXPANDIDOS; indice += 1) {
    const cursor = new Date(primerDia.getTime() + indice * MS_DIA);
    if (cursor.getTime() >= hasta.getTime()) break;

    const { anio, mes, dia, diaSemana, fecha } = diaLocal(
      // +12 h evita que un cambio de offset deje el cursor justo en el borde.
      new Date(cursor.getTime() + MS_DIA / 2),
      offsetMinutos,
    );

    const delDia = porDia.get(diaSemana);
    if (!delDia) continue;

    for (const franja of delDia) {
      const inicioMin = minutosDesdeMedianoche(franja.startTime);
      if (inicioMin === null) continue;
      const duracion = duracionEfectiva(franja);
      const startAt = instanteLocal(anio, mes, dia, inicioMin, offsetMinutos);
      const endAt = new Date(startAt.getTime() + duracion * MS_MINUTO);

      if (endAt.getTime() <= desde.getTime()) continue;
      if (startAt.getTime() >= hasta.getTime()) continue;

      resultado.push({
        id: `class:${franja.id}:${fecha}`,
        franjaId: franja.id,
        fecha,
        startAt,
        endAt,
        durationMinutes: duracion,
        franja,
      });
    }
  }

  resultado.sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  return resultado;
}

/** ¿Terminó, está ocurriendo o falta? */
export function estadoDeClase(
  ocurrencia: { startAt: Date; endAt: Date },
  ahora: Date,
): EstadoClase {
  const t = ahora.getTime();
  if (t >= ocurrencia.endAt.getTime()) return 'TERMINADA';
  if (t >= ocurrencia.startAt.getTime()) return 'EN_CURSO';
  return 'PROXIMA';
}

/** La que está ocurriendo ahora mismo, si hay alguna. */
export function claseEnCurso<T extends { startAt: Date; endAt: Date }>(
  ocurrencias: readonly T[],
  ahora: Date,
): T | null {
  const t = ahora.getTime();
  let encontrada: T | null = null;
  for (const ocurrencia of ocurrencias) {
    if (ocurrencia.startAt.getTime() <= t && t < ocurrencia.endAt.getTime()) {
      // Si se solapan dos, gana la que empezó más tarde: es la que el docente
      // acaba de entrar a dictar.
      if (!encontrada || ocurrencia.startAt.getTime() > encontrada.startAt.getTime()) {
        encontrada = ocurrencia;
      }
    }
  }
  return encontrada;
}

/** La siguiente que todavía no ha empezado. */
export function proximaClase<T extends { startAt: Date }>(
  ocurrencias: readonly T[],
  ahora: Date,
): T | null {
  const t = ahora.getTime();
  let mejor: T | null = null;
  for (const ocurrencia of ocurrencias) {
    if (ocurrencia.startAt.getTime() <= t) continue;
    if (!mejor || ocurrencia.startAt.getTime() < mejor.startAt.getTime()) mejor = ocurrencia;
  }
  return mejor;
}

/**
 * Minutos que faltan (positivo) o que han pasado (negativo) hasta un instante.
 * Se redondea hacia arriba para que "faltan 0 minutos" solo aparezca cuando de
 * verdad ya empezó, y no durante los últimos 59 segundos.
 */
export function minutosHasta(instante: Date, ahora: Date): number {
  return Math.ceil((instante.getTime() - ahora.getTime()) / MS_MINUTO);
}

/**
 * ¿Toca disparar el aviso de `antelacion` minutos en esta pasada del scheduler?
 *
 * La ventana existe porque el scheduler no corre en el milisegundo exacto: con
 * una comprobación de igualdad, un tick que llega dos segundos tarde se salta
 * el aviso para siempre. Con ventana, el aviso cae dentro de una sola pasada y
 * el `dedupeKey` se encarga de que dos pasadas solapadas no lo repitan.
 */
export function avisoEnVentana(
  inicio: Date,
  antelacionMinutos: number,
  ahora: Date,
  ventanaMinutos: number,
): boolean {
  const objetivo = inicio.getTime() - antelacionMinutos * MS_MINUTO;
  const t = ahora.getTime();
  return t >= objetivo && t < objetivo + ventanaMinutos * MS_MINUTO;
}

/**
 * ¿Un minuto del día cae dentro de una franja 'HH:mm'–'HH:mm'?
 *
 * Contempla la franja que cruza la medianoche, que es el caso normal de las
 * horas de silencio (21:00–06:00): ahí `inicio > fin` y la condición se
 * invierte. Con una comparación ingenua, silenciar de noche no silenciaba nada.
 */
export function dentroDeFranja(inicio: string, fin: string, minutoDelDia: number): boolean {
  const desde = minutosDesdeMedianoche(inicio);
  const hasta = minutosDesdeMedianoche(fin);
  if (desde === null || hasta === null || desde === hasta) return false;
  return desde < hasta
    ? minutoDelDia >= desde && minutoDelDia < hasta
    : minutoDelDia >= desde || minutoDelDia < hasta;
}

/** Minuto del día (0–1439) en hora del campus para un instante UTC. */
export function minutoDelDiaLocal(instante: Date, offsetMinutos: number): number {
  const desplazado = new Date(instante.getTime() + offsetMinutos * MS_MINUTO);
  return desplazado.getUTCHours() * 60 + desplazado.getUTCMinutes();
}

/** Antelaciones válidas y ordenadas, sin repetidos. La UI ofrece estas. */
export const ANTELACIONES_VALIDAS = [0, 5, 10, 15, 30, 60, 120, 1440] as const;

export function normalizarAntelaciones(valores: readonly number[] | undefined): number[] {
  if (!valores?.length) return [];
  const limpias = new Set<number>();
  for (const valor of valores) {
    const entero = Math.round(Number(valor));
    if (!Number.isFinite(entero) || entero < 0 || entero > 10080) continue;
    limpias.add(entero);
  }
  return [...limpias].sort((a, b) => b - a);
}
