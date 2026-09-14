/**
 * Fecha de una clase: el día del campus, guardado siempre como el mismo
 * instante. Lógica pura, sin I/O.
 *
 * El índice único de Asistencia es (estudiante, materia, `date`), así que dos
 * instantes distintos para el mismo día son **dos clases**: el porcentaje del
 * estudiante cuenta el día dos veces y ningún cliente lo delata, porque todos
 * pintan la fecha con `slice(0, 10)` y los dos registros caen en la misma
 * casilla.
 *
 * Eso es lo que pasaba. Cada escritor mandaba el día a su manera:
 *
 * | Quién             | Manda                                | Llegaba como          |
 * |-------------------|--------------------------------------|-----------------------|
 * | Escritorio        | `${día}T12:00:00` en hora local → ISO | 17:00Z (en Colombia)  |
 * | Móvil             | `DateTime(a,m,d).toIso8601String()`  | medianoche **del servidor**, sin zona |
 * | Planilla escaneada| `AAAA-MM-DD`                          | 00:00Z                |
 *
 * Y el QR iba a ser el cuarto. A partir de aquí el servidor decide: cualquier
 * forma de decir «el día D» se guarda como **mediodía del campus del día D**.
 * Es exactamente lo que ya guardaba el escritorio instalado en Colombia, así
 * que el registro más común no cambia de instante y lo que ya estaba escrito
 * sigue casando con lo que se escriba mañana.
 *
 * El mediodía no es un capricho: con cualquier desfase entre −11 h y +12 h su
 * fecha UTC es la del propio día, que es lo que leen los clientes.
 */
import { esFechaReal } from '../uniplanner/message.js';

const MS_MINUTO = 60_000;

/** `AAAA-MM-DD`. */
const SOLO_DIA = /^(\d{4}-\d{2}-\d{2})$/;
/** Fecha y hora **sin zona**: hora de pared de quien la escribió. */
const SIN_ZONA = /^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?$/;

/** Día del campus (`AAAA-MM-DD`) en el que cae un instante. */
export function diaDeCampus(instante: Date, offsetMinutos: number): string {
  return new Date(instante.getTime() + offsetMinutos * MS_MINUTO).toISOString().slice(0, 10);
}

/**
 * El instante con el que se guarda la clase del día `dia`: su mediodía en el
 * campus.
 *
 * Lanza si el día no existe: quien llama ya validó, y un `2026-02-31` que
 * llegara hasta aquí desbordaría en silencio al 3 de marzo.
 */
export function instanteDeClase(dia: string, offsetMinutos: number): Date {
  if (!esFechaReal(dia)) throw new RangeError(`Día de clase inválido: ${dia}`);
  const [anio, mes, diaDelMes] = dia.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(anio, mes - 1, diaDelMes, 12, 0) - offsetMinutos * MS_MINUTO);
}

/**
 * Qué día de clase quiso decir quien mandó `entrada`, o `null` si no dice
 * ninguno.
 *
 * - `AAAA-MM-DD` y una fecha-hora **sin zona** se leen literalmente: es la hora
 *   de pared de quien la escribió, que para una clase es el campus. Pasarla por
 *   `new Date()` la interpretaría en la zona del servidor —que es justo lo que
 *   hacía el móvil—, y en un servidor en UTC la clase de las 7 de la mañana en
 *   Colombia se guardaba como la del día anterior.
 * - Un instante con zona es un momento real y cuenta el día del campus en que
 *   cae.
 * - **La medianoche UTC exacta es la excepción**: es como se serializa una
 *   fecha sin hora (`new Date('2026-09-13')`, `DateTime.utc(a,m,d)`), no un
 *   instante que alguien observara. Leída como instante caería en la tarde del
 *   día anterior en Colombia, y así es como la planilla escaneada guardaba sus
 *   columnas.
 */
export function diaDeClase(entrada: unknown, offsetMinutos: number): string | null {
  if (entrada instanceof Date) return diaDeInstante(entrada, offsetMinutos);
  if (typeof entrada !== 'string') return null;

  const texto = entrada.trim();
  const literal = SOLO_DIA.exec(texto) ?? SIN_ZONA.exec(texto);
  if (literal) {
    const dia = literal[1] as string;
    return esFechaReal(dia) ? dia : null;
  }

  // Lo demás tiene que ser una fecha ISO con zona. `new Date()` acepta además
  // formatos locales ambiguos («09/10/2026»), y adivinar el orden del día y el
  // mes de un acta es peor que rechazarla.
  if (!/^\d{4}-\d{2}-\d{2}T/.test(texto)) return null;
  return diaDeInstante(new Date(texto), offsetMinutos);
}

function diaDeInstante(instante: Date, offsetMinutos: number): string | null {
  const ms = instante.getTime();
  if (Number.isNaN(ms)) return null;
  if (ms % (24 * 60 * MS_MINUTO) === 0) return instante.toISOString().slice(0, 10);
  return diaDeCampus(instante, offsetMinutos);
}

/**
 * La fecha canónica de la clase, o `null` si `entrada` no dice ningún día.
 *
 * Es lo que se guarda en `Asistencia.date`. Todas las rutas que escriben
 * asistencia pasan por aquí para que la misma clase sea siempre el mismo
 * documento.
 */
export function normalizarFechaDeClase(entrada: unknown, offsetMinutos: number): Date | null {
  const dia = diaDeClase(entrada, offsetMinutos);
  return dia ? instanteDeClase(dia, offsetMinutos) : null;
}

// ── Migración de lo guardado antes de normalizar ─────────────────────────────

export type RegistroParaMigrar = {
  id: string;
  studentId: string;
  subjectId: string;
  date: Date;
  updatedAt: Date | null;
  deletedAt: Date | null;
  /** Opcionales: los registros anteriores al QR no los traen. */
  present?: boolean;
  origen?: string | null;
};

/**
 * La ausencia que escribe el QR al cerrar la lista (`origen: 'QR'`, ausente).
 * Es un relleno —«no escaneó»—, no una decisión de nadie: nunca gana a un
 * registro puesto a mano aunque sea más reciente.
 */
const esAusenciaAutomatica = (r: RegistroParaMigrar) => r.origen === 'QR' && r.present === false;

export type PlanDeMigracion = {
  /** Registros que se quedan, con la fecha canónica que les falta. */
  normalizar: { id: string; date: Date }[];
  /** Duplicados de la misma clase: se respaldan y se borran. */
  borrar: { id: string; conservado: string }[];
  /** Cuántas clases tenían más de un registro. */
  clasesDuplicadas: number;
  /** Registros cuya fecha no dice ningún día. No se tocan. */
  sinDia: string[];
};

/**
 * Qué hacer con la asistencia guardada antes de que la fecha se normalizara.
 *
 * Agrupa por (estudiante, materia, día del campus). En cada grupo **se queda
 * el registro vivo modificado más recientemente** —la última decisión que
 * alguien tomó sobre esa clase—; empatados, el que ya tiene la fecha canónica,
 * y después el de id menor, para que el resultado no dependa del orden de
 * lectura. Los demás son duplicados: el porcentaje del estudiante contaba ese
 * día dos veces.
 *
 * Los borrados se borran de verdad y no con `deletedAt`: el índice único
 * incluye los borrados lógicos, así que un duplicado «borrado» que ya tuviera
 * la fecha canónica impediría darle esa fecha al que se queda. Por eso el
 * script los respalda antes.
 *
 * Idempotente: sobre datos ya migrados devuelve un plan vacío.
 */
export function planearMigracionDeFechas(
  registros: readonly RegistroParaMigrar[],
  offsetMinutos: number,
): PlanDeMigracion {
  const grupos = new Map<string, { registro: RegistroParaMigrar; canonica: Date }[]>();
  const sinDia: string[] = [];

  for (const registro of registros) {
    const dia = diaDeClase(registro.date, offsetMinutos);
    if (!dia) {
      sinDia.push(registro.id);
      continue;
    }
    const clave = `${registro.studentId}|${registro.subjectId}|${dia}`;
    const lista = grupos.get(clave) ?? [];
    lista.push({ registro, canonica: instanteDeClase(dia, offsetMinutos) });
    grupos.set(clave, lista);
  }

  const plan: PlanDeMigracion = { normalizar: [], borrar: [], clasesDuplicadas: 0, sinDia };
  const hora = (fecha: Date | null) => (fecha ? fecha.getTime() : 0);

  for (const lista of grupos.values()) {
    const ordenada = [...lista].sort((a, b) => {
      const vivoA = a.registro.deletedAt ? 1 : 0;
      const vivoB = b.registro.deletedAt ? 1 : 0;
      if (vivoA !== vivoB) return vivoA - vivoB;
      // Entre desplegar y migrar, el cierre de una lista por QR escribe
      // ausentes en la fecha canónica, y ese registro es más reciente que el
      // presente que el docente puso a mano con la fecha antigua. Por fecha
      // ganaría la ausencia y la migración borraría el presente.
      const rellenoA = esAusenciaAutomatica(a.registro) ? 1 : 0;
      const rellenoB = esAusenciaAutomatica(b.registro) ? 1 : 0;
      if (rellenoA !== rellenoB) return rellenoA - rellenoB;
      const recienteA = hora(a.registro.updatedAt);
      const recienteB = hora(b.registro.updatedAt);
      if (recienteA !== recienteB) return recienteB - recienteA;
      const canonA = a.registro.date.getTime() === a.canonica.getTime() ? 0 : 1;
      const canonB = b.registro.date.getTime() === b.canonica.getTime() ? 0 : 1;
      if (canonA !== canonB) return canonA - canonB;
      return a.registro.id.localeCompare(b.registro.id);
    });

    const [queda, ...sobran] = ordenada as [
      { registro: RegistroParaMigrar; canonica: Date },
      ...{ registro: RegistroParaMigrar; canonica: Date }[],
    ];
    if (sobran.length > 0) plan.clasesDuplicadas++;
    for (const sobra of sobran) plan.borrar.push({ id: sobra.registro.id, conservado: queda.registro.id });
    if (queda.registro.date.getTime() !== queda.canonica.getTime()) {
      plan.normalizar.push({ id: queda.registro.id, date: queda.canonica });
    }
  }

  return plan;
}
