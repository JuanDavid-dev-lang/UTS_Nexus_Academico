/**
 * Qué semestre corre hoy. Lógica pura, sin I/O.
 *
 * Antes cada cliente lo deducía por su cuenta a partir del mes de su reloj:
 * un equipo con la fecha mal puesta, o un semestre que la universidad empezó
 * el 9 de febrero y terminó el 26 de junio, bastaban para que el escritorio y
 * el teléfono abrieran las pantallas en semestres distintos. Ahora lo decide
 * el servidor con las fechas que pone la administración en cada periodo
 * (`AcademicPeriod.startsOn` / `endsOn`) y, sin ellas, con el calendario por
 * defecto (ciclo 1 de enero a junio, ciclo 2 de julio a diciembre).
 *
 * El día se mide **en el campus** (`CAMPUS_UTC_OFFSET_MIN`), no en la zona del
 * servidor: un servidor en UTC daría el 1 de julio a las siete de la tarde del
 * 30 de junio en Bucaramanga.
 */
import { finDePeriodoPorDefecto, esFinDePeriodoValido } from './period-calendar.js';
import { compararPeriodos, esPeriodoValido } from './period-lifecycle.js';

const MS_MINUTO = 60_000;

/** Primer día por defecto de cada ciclo, `MM-DD`. Solo los dos semestres. */
const INICIO_POR_DEFECTO: Record<string, string> = {
  '1': '01-01',
  '2': '07-01',
};

export type OrigenPeriodo = 'configurado' | 'calendario';

/** Lo mínimo de un `AcademicPeriod` que hace falta para decidir. */
export type PeriodoConFechas = {
  period: string;
  startsOn?: string | null;
  endsOn?: string | null;
};

export type PeriodoVigente = {
  period: string;
  /** Primer día en vigor (`AAAA-MM-DD`): el configurado o el de por defecto. */
  startsOn: string | null;
  /** Último día en vigor (`AAAA-MM-DD`): el configurado o el de por defecto. */
  endsOn: string | null;
  /** `configurado` si lo decidieron fechas de la administración. */
  origen: OrigenPeriodo;
};

/** El primer día por defecto de un periodo, o `null` si su ciclo no tiene. */
export function inicioDePeriodoPorDefecto(periodo: string): string | null {
  if (!esPeriodoValido(periodo)) return null;
  const [anio, ciclo] = periodo.split('-') as [string, string];
  const mesDia = INICIO_POR_DEFECTO[ciclo];
  return mesDia ? `${anio}-${mesDia}` : null;
}

/** El día del campus (`AAAA-MM-DD`) de un instante. */
export function diaDelCampus(ahora: Date, offsetMinutos: number): string {
  return new Date(ahora.getTime() + offsetMinutos * MS_MINUTO).toISOString().slice(0, 10);
}

/** El periodo de calendario de un día: enero–junio es `-1`, julio–diciembre `-2`. */
export function periodoDeCalendario(dia: string): string {
  const anio = dia.slice(0, 4);
  const mes = Number(dia.slice(5, 7));
  return `${anio}-${mes <= 6 ? 1 : 2}`;
}

function fechaValida(valor: string | null | undefined): string | null {
  return esFinDePeriodoValido(valor) ? valor : null;
}

/**
 * Si un par de fechas es coherente: inicio no posterior al fin. Las dos se
 * comparan ya rellenadas con las de por defecto, porque es así como se usan.
 */
export function rangoDePeriodoValido(periodo: PeriodoConFechas): boolean {
  const rango = rangoEnVigor(periodo);
  if (!rango.startsOn || !rango.endsOn) return true;
  return rango.startsOn <= rango.endsOn;
}

/** Fechas en vigor: las configuradas y, donde falten, las de por defecto. */
function rangoEnVigor(periodo: PeriodoConFechas): {
  startsOn: string | null;
  endsOn: string | null;
  configurado: boolean;
  inicioConfigurado: boolean;
} {
  const inicio = fechaValida(periodo.startsOn);
  const fin = fechaValida(periodo.endsOn);
  return {
    startsOn: inicio ?? inicioDePeriodoPorDefecto(periodo.period),
    endsOn: fin ?? finDePeriodoPorDefecto(periodo.period),
    configurado: Boolean(inicio || fin),
    inicioConfigurado: Boolean(inicio),
  };
}

function contiene(rango: { startsOn: string | null; endsOn: string | null }, dia: string): boolean {
  return Boolean(rango.startsOn && rango.endsOn && rango.startsOn <= dia && dia <= rango.endsOn);
}

/**
 * El periodo que corre en `ahora`.
 *
 * 1. Un periodo con alguna fecha configurada cuyo rango en vigor contiene el
 *    día → `configurado`. Si se solapan dos, el más reciente.
 * 2. Si no, el de calendario (`-1` o `-2` por el mes) cuando su rango lo
 *    contiene → `calendario`.
 * 3. En el hueco entre semestres (el de calendario ya terminó o aún no
 *    empezó según sus fechas), el siguiente que **ya tiene inicio
 *    configurado** → `configurado`. Las pantallas abren en el semestre que
 *    viene y no en uno que se cerró.
 * 4. Si nadie configuró el siguiente, el de calendario → `calendario`.
 */
export function periodoVigente(
  periodos: readonly PeriodoConFechas[],
  ahora: Date,
  offsetMinutos: number,
): PeriodoVigente {
  const dia = diaDelCampus(ahora, offsetMinutos);
  const validos = periodos.filter((p) => esPeriodoValido(p.period));

  const configurados = validos
    .map((p) => ({ period: p.period, ...rangoEnVigor(p) }))
    .filter((p) => p.configurado)
    .sort((a, b) => compararPeriodos(b.period, a.period));

  const enCurso = configurados.find((p) => contiene(p, dia));
  if (enCurso) {
    return { period: enCurso.period, startsOn: enCurso.startsOn, endsOn: enCurso.endsOn, origen: 'configurado' };
  }

  const deCalendario = periodoDeCalendario(dia);
  const propio = validos.find((p) => p.period === deCalendario);
  const rangoCalendario = rangoEnVigor(propio ?? { period: deCalendario });
  const calendario: PeriodoVigente = {
    period: deCalendario,
    startsOn: rangoCalendario.startsOn,
    endsOn: rangoCalendario.endsOn,
    origen: 'calendario',
  };
  if (contiene(rangoCalendario, dia)) return calendario;

  const siguiente = configurados
    .filter((p) => p.inicioConfigurado && p.startsOn !== null && p.startsOn > dia)
    .sort((a, b) => (a.startsOn! < b.startsOn! ? -1 : 1))[0];
  if (siguiente) {
    return { period: siguiente.period, startsOn: siguiente.startsOn, endsOn: siguiente.endsOn, origen: 'configurado' };
  }
  return calendario;
}
