/**
 * Cálculos del calendario — puros, sin React.
 *
 * Aquí NO se decide a qué hora es una clase: eso llega resuelto del backend.
 * Lo que se resuelve aquí es cómo se dibuja: qué días entran en la semana, en
 * qué franja vertical cae cada bloque y cómo se reparten los que se solapan.
 *
 * Todo lo que muestra una hora usa el desfase del campus que envía el servidor,
 * no la zona del equipo: un portátil con la zona mal puesta seguiría enseñando
 * la hora real de la clase.
 */
import type { AgendaItem } from '@/domain/schemas/agenda';

const MS_MINUTO = 60_000;
const MS_DIA = 86_400_000;

export type VistaAgenda = 'dia' | 'semana' | 'mes' | 'proximas';

/** Desfase por defecto si el servidor no lo envía (Colombia, UTC-5). */
export const OFFSET_CAMPUS_POR_DEFECTO = -300;

/** Partes del día en hora del campus. */
export function partesCampus(fecha: Date | string, offsetMinutos: number) {
  const instante = typeof fecha === 'string' ? new Date(fecha) : fecha;
  const desplazado = new Date(instante.getTime() + offsetMinutos * MS_MINUTO);
  return {
    anio: desplazado.getUTCFullYear(),
    mes: desplazado.getUTCMonth() + 1,
    dia: desplazado.getUTCDate(),
    horas: desplazado.getUTCHours(),
    minutos: desplazado.getUTCMinutes(),
    /** Lunes = 1 … Domingo = 7. */
    diaSemana: (desplazado.getUTCDay() === 0 ? 7 : desplazado.getUTCDay()) as 1 | 2 | 3 | 4 | 5 | 6 | 7,
  };
}

/** 'YYYY-MM-DD' en hora del campus. Es la clave con la que agrupa el calendario. */
export function fechaCampus(fecha: Date | string, offsetMinutos: number): string {
  const { anio, mes, dia } = partesCampus(fecha, offsetMinutos);
  return `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/** Hora de pared del campus en formato 12 h: "10:00 a. m.". */
export function horaCampus(fecha: Date | string, offsetMinutos: number): string {
  const { horas, minutos } = partesCampus(fecha, offsetMinutos);
  const sufijo = horas < 12 ? 'a. m.' : 'p. m.';
  const doce = horas % 12 === 0 ? 12 : horas % 12;
  return `${doce}:${String(minutos).padStart(2, '0')} ${sufijo}`;
}

/** Minutos desde la medianoche del campus. Es la coordenada vertical del bloque. */
export function minutoDelDia(fecha: Date | string, offsetMinutos: number): number {
  const { horas, minutos } = partesCampus(fecha, offsetMinutos);
  return horas * 60 + minutos;
}

/** Medianoche del campus, como instante UTC. */
export function inicioDia(fecha: Date, offsetMinutos: number): Date {
  const { anio, mes, dia } = partesCampus(fecha, offsetMinutos);
  return new Date(Date.UTC(anio, mes - 1, dia) - offsetMinutos * MS_MINUTO);
}

/** Medianoche del lunes de esa semana, como instante UTC. */
export function inicioSemana(fecha: Date, offsetMinutos: number): Date {
  const { diaSemana } = partesCampus(fecha, offsetMinutos);
  return new Date(inicioDia(fecha, offsetMinutos).getTime() - (diaSemana - 1) * MS_DIA);
}

/** Medianoche del día 1 de ese mes, como instante UTC. */
export function inicioMes(fecha: Date, offsetMinutos: number): Date {
  const { anio, mes } = partesCampus(fecha, offsetMinutos);
  return new Date(Date.UTC(anio, mes - 1, 1) - offsetMinutos * MS_MINUTO);
}

/** Rango [desde, hasta) que hay que pedirle al servidor para una vista. */
export function rangoDeVista(
  vista: VistaAgenda,
  ancla: Date,
  offsetMinutos: number,
): { desde: Date; hasta: Date } {
  switch (vista) {
    case 'dia': {
      const desde = inicioDia(ancla, offsetMinutos);
      return { desde, hasta: new Date(desde.getTime() + MS_DIA) };
    }
    case 'semana': {
      const desde = inicioSemana(ancla, offsetMinutos);
      return { desde, hasta: new Date(desde.getTime() + 7 * MS_DIA) };
    }
    case 'mes': {
      // La rejilla del mes empieza el lunes de la semana del día 1 y termina el
      // domingo de la del último día: pedir solo el mes dejaría en blanco los
      // huecos de los bordes, que son días reales con clases reales.
      const primero = inicioMes(ancla, offsetMinutos);
      const desde = inicioSemana(primero, offsetMinutos);
      return { desde, hasta: new Date(desde.getTime() + 42 * MS_DIA) };
    }
    case 'proximas':
    default: {
      const desde = inicioDia(ancla, offsetMinutos);
      return { desde, hasta: new Date(desde.getTime() + 30 * MS_DIA) };
    }
  }
}

/** Los siete días de la semana de `ancla`, como instantes de medianoche. */
export function diasDeSemana(ancla: Date, offsetMinutos: number): Date[] {
  const lunes = inicioSemana(ancla, offsetMinutos);
  return Array.from({ length: 7 }, (_, indice) => new Date(lunes.getTime() + indice * MS_DIA));
}

/** Las seis filas de siete días de la rejilla mensual. */
export function diasDeMes(ancla: Date, offsetMinutos: number): Date[] {
  const { desde } = rangoDeVista('mes', ancla, offsetMinutos);
  return Array.from({ length: 42 }, (_, indice) => new Date(desde.getTime() + indice * MS_DIA));
}

/** Desplaza el ancla una unidad de la vista actual. */
export function navegar(vista: VistaAgenda, ancla: Date, pasos: number, offsetMinutos: number): Date {
  if (vista === 'mes') {
    const { anio, mes, dia } = partesCampus(ancla, offsetMinutos);
    // Se fija al día 1 antes de sumar meses: desde un 31, sumar un mes daría
    // marzo desde enero, saltándose febrero.
    return new Date(Date.UTC(anio, mes - 1 + pasos, Math.min(dia, 28)) - offsetMinutos * MS_MINUTO);
  }
  const dias = vista === 'semana' ? 7 : 1;
  return new Date(ancla.getTime() + pasos * dias * MS_DIA);
}

/** Agrupa por fecha del campus, conservando el orden de entrada. */
export function agruparPorFecha(items: readonly AgendaItem[]): Map<string, AgendaItem[]> {
  const mapa = new Map<string, AgendaItem[]>();
  for (const item of items) {
    const lista = mapa.get(item.date);
    if (lista) lista.push(item);
    else mapa.set(item.date, [item]);
  }
  return mapa;
}

export type BloqueSemanal = {
  item: AgendaItem;
  /** Porcentaje desde el borde superior de la rejilla. */
  top: number;
  /** Alto en porcentaje de la rejilla. */
  alto: number;
  /** Columna dentro del grupo de solapados y cuántas hay. */
  columna: number;
  columnas: number;
};

/**
 * Coloca los items de un día en la rejilla vertical.
 *
 * `desdeHora`/`hastaHora` acotan la rejilla a la jornada real: pintar las 24
 * horas para mostrar clases de 7 a 21 deja media pantalla vacía y comprime lo
 * que interesa. Lo que caiga fuera se recorta al borde en vez de desaparecer.
 *
 * Los solapes se reparten en columnas dentro de cada grupo conectado: dos
 * clases a la misma hora se ven lado a lado, no una encima de la otra.
 */
export function distribuirDia(
  items: readonly AgendaItem[],
  offsetMinutos: number,
  desdeHora = 6,
  hastaHora = 22,
): BloqueSemanal[] {
  const minutoInicio = desdeHora * 60;
  const total = Math.max(1, (hastaHora - desdeHora) * 60);

  const ordenados = [...items]
    .filter((item) => !item.allDay)
    .map((item) => {
      const inicio = minutoDelDia(item.startAt, offsetMinutos);
      // Una entrega no tiene duración: se le da un mínimo visible, si no sería
      // una línea de cero píxeles imposible de tocar.
      const duracion = Math.max(30, item.durationMinutes || 30);
      return { item, inicio, fin: inicio + duracion };
    })
    .sort((a, b) => a.inicio - b.inicio || a.fin - b.fin);

  const bloques: BloqueSemanal[] = [];
  let grupo: typeof ordenados = [];
  let finGrupo = -1;

  const cerrarGrupo = () => {
    if (grupo.length === 0) return;
    // Reparto por columnas: cada uno va a la primera columna libre.
    const finPorColumna: number[] = [];
    const columnaDe = new Map<string, number>();

    for (const entrada of grupo) {
      let columna = finPorColumna.findIndex((fin) => fin <= entrada.inicio);
      if (columna === -1) {
        columna = finPorColumna.length;
        finPorColumna.push(entrada.fin);
      } else {
        finPorColumna[columna] = entrada.fin;
      }
      columnaDe.set(entrada.item.id, columna);
    }

    for (const entrada of grupo) {
      const recortadoInicio = Math.max(minutoInicio, entrada.inicio);
      const recortadoFin = Math.min(minutoInicio + total, entrada.fin);
      bloques.push({
        item: entrada.item,
        top: ((recortadoInicio - minutoInicio) / total) * 100,
        alto: (Math.max(15, recortadoFin - recortadoInicio) / total) * 100,
        columna: columnaDe.get(entrada.item.id) ?? 0,
        columnas: finPorColumna.length,
      });
    }
    grupo = [];
    finGrupo = -1;
  };

  for (const entrada of ordenados) {
    if (grupo.length > 0 && entrada.inicio >= finGrupo) cerrarGrupo();
    grupo.push(entrada);
    finGrupo = Math.max(finGrupo, entrada.fin);
  }
  cerrarGrupo();

  return bloques;
}

/**
 * Franja horaria que conviene dibujar para un conjunto de items.
 *
 * Se ajusta a lo que hay, con una hora de aire arriba y abajo, y con un mínimo
 * de 7:00–20:00 para que una semana con una sola clase no muestre una rejilla
 * de dos horas donde no cabe nada más.
 */
export function franjaVisible(
  items: readonly AgendaItem[],
  offsetMinutos: number,
): { desdeHora: number; hastaHora: number } {
  let minimo = 7 * 60;
  let maximo = 20 * 60;

  for (const item of items) {
    if (item.allDay) continue;
    const inicio = minutoDelDia(item.startAt, offsetMinutos);
    const fin = inicio + Math.max(30, item.durationMinutes || 30);
    minimo = Math.min(minimo, inicio);
    maximo = Math.max(maximo, fin);
  }

  return {
    desdeHora: Math.max(0, Math.floor(minimo / 60) - 1),
    hastaHora: Math.min(24, Math.ceil(maximo / 60) + 1),
  };
}

/**
 * Campos de formulario → instante UTC, interpretando la hora como del campus.
 *
 * `<input type="datetime-local">` habría sido más corto, pero devuelve la hora
 * en la zona del equipo: un portátil configurado en otra zona guardaría el
 * parcial a una hora distinta de la que escribió el docente.
 */
export function desdeCampos(fecha: string, hora: string, offsetMinutos: number): string | null {
  const partesFecha = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha.trim());
  const partesHora = /^(\d{2}):(\d{2})$/.exec(hora.trim());
  if (!partesFecha || !partesHora) return null;

  const instante =
    Date.UTC(
      Number(partesFecha[1]),
      Number(partesFecha[2]) - 1,
      Number(partesFecha[3]),
      Number(partesHora[1]),
      Number(partesHora[2]),
    ) -
    offsetMinutos * MS_MINUTO;

  return Number.isFinite(instante) ? new Date(instante).toISOString() : null;
}

/** Instante UTC → campos de formulario en hora del campus. */
export function aCampos(iso: string | null | undefined, offsetMinutos: number): { fecha: string; hora: string } {
  if (!iso) return { fecha: '', hora: '' };
  const instante = new Date(iso);
  if (Number.isNaN(instante.getTime())) return { fecha: '', hora: '' };
  const { horas, minutos } = partesCampus(instante, offsetMinutos);
  return {
    fecha: fechaCampus(instante, offsetMinutos),
    hora: `${String(horas).padStart(2, '0')}:${String(minutos).padStart(2, '0')}`,
  };
}

/** Texto de la espera: "32 minutos", "2 h 10 min", "3 días". */
export function tiempoRestante(minutos: number): string {
  if (minutos <= 0) return 'ahora';
  if (minutos < 60) return `${minutos} minuto${minutos === 1 ? '' : 's'}`;
  if (minutos < 1440) {
    const horas = Math.floor(minutos / 60);
    const resto = minutos % 60;
    return resto === 0 ? `${horas} hora${horas === 1 ? '' : 's'}` : `${horas} h ${resto} min`;
  }
  const dias = Math.round(minutos / 1440);
  return `${dias} día${dias === 1 ? '' : 's'}`;
}

const NOMBRE_DIA = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
const NOMBRE_MES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

export function nombreDia(fecha: Date, offsetMinutos: number): string {
  return NOMBRE_DIA[partesCampus(fecha, offsetMinutos).diaSemana - 1] ?? '';
}

export function nombreMes(fecha: Date, offsetMinutos: number): string {
  return NOMBRE_MES[partesCampus(fecha, offsetMinutos).mes - 1] ?? '';
}

/** Título de la barra de navegación según la vista. */
export function tituloDeVista(vista: VistaAgenda, ancla: Date, offsetMinutos: number): string {
  const { dia, anio } = partesCampus(ancla, offsetMinutos);

  if (vista === 'dia') {
    return `${nombreDia(ancla, offsetMinutos)} ${dia} de ${nombreMes(ancla, offsetMinutos)}`;
  }
  if (vista === 'mes') {
    return `${nombreMes(ancla, offsetMinutos)} de ${anio}`;
  }
  if (vista === 'proximas') return 'Próximas actividades';

  const dias = diasDeSemana(ancla, offsetMinutos);
  const primero = partesCampus(dias[0]!, offsetMinutos);
  const ultimo = partesCampus(dias[6]!, offsetMinutos);
  if (primero.mes === ultimo.mes) {
    return `${primero.dia} – ${ultimo.dia} de ${nombreMes(dias[0]!, offsetMinutos)}`;
  }
  return `${primero.dia} ${nombreMes(dias[0]!, offsetMinutos)} – ${ultimo.dia} ${nombreMes(dias[6]!, offsetMinutos)}`;
}

/** ¿Esa fecha es hoy en el campus? */
export function esHoy(fecha: Date, offsetMinutos: number, ahora = new Date()): boolean {
  return fechaCampus(fecha, offsetMinutos) === fechaCampus(ahora, offsetMinutos);
}
