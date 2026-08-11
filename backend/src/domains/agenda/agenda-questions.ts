/**
 * Interpretación de preguntas sobre la agenda — pura, sin I/O y sin IA.
 *
 * El asistente responde con Ollama cuando está disponible, pero el horario es
 * justo el dato que NO se puede inventar: un docente que llega a un aula
 * equivocada porque el modelo alucinó una hora perdió una clase de verdad. Por
 * eso la intención se detecta aquí con reglas, el rango se calcula aquí, y lo
 * que el modelo recibe (o lo que se responde sin él) sale siempre de las
 * ocurrencias reales.
 *
 * `detectarIntencionAgenda` devuelve `null` cuando la pregunta no va de agenda;
 * ahí el asistente sigue su camino normal.
 */
import {
  inicioDiaLocal,
  inicioSemanaLocal,
  minutosDesdeMedianoche,
} from './agenda.service.js';

const MS_DIA = 86_400_000;
const MS_MINUTO = 60_000;

export type IntencionAgenda =
  | { tipo: 'PROXIMA' }
  | { tipo: 'EN_CURSO' }
  | { tipo: 'RANGO'; desde: Date; hasta: Date; etiqueta: string; soloDespuesDe?: Date }
  | { tipo: 'MATERIA'; termino: string };

/** Quita tildes y baja a minúsculas para que "qué" y "que" sean lo mismo. */
export function normalizarTexto(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

const PALABRAS_AGENDA = [
  'clase',
  'clases',
  'horario',
  'agenda',
  'calendario',
  'materia',
  'evaluacion',
  'evaluaciones',
  'parcial',
  'parciales',
  'examen',
  'examenes',
  'entrega',
  'entregas',
  'tutoria',
  'tutorias',
  'reunion',
  'reuniones',
  'evento',
  'eventos',
  'dicto',
  'dictar',
];

/** ¿La pregunta va de la agenda? Sin esto responderíamos horarios a cualquier cosa. */
export function pareceDeAgenda(pregunta: string): boolean {
  const texto = normalizarTexto(pregunta);
  if (PALABRAS_AGENDA.some(palabra => texto.includes(palabra))) return true;
  // "¿qué tengo mañana?" y "¿a qué hora tengo X?" no nombran ninguna palabra de
  // la lista: la primera no dice de qué, y la segunda dice "hora", no "horario".
  return /\bque tengo\b|\bque hay\b|\bque sigue\b|\bque viene\b|\ba que hora\b/.test(texto);
}

/**
 * Traduce la pregunta a un rango de fechas concreto.
 *
 * `ahora` y el desfase del campus entran como parámetros: la función no lee el
 * reloj ni la zona del proceso, y por eso se puede probar.
 */
export function detectarIntencionAgenda(
  pregunta: string,
  ahora: Date,
  offsetMinutos: number,
): IntencionAgenda | null {
  const texto = normalizarTexto(pregunta);
  if (!pareceDeAgenda(texto)) return null;

  const hoy = inicioDiaLocal(ahora, offsetMinutos);

  // ── Clase actual ─────────────────────────────────────────────────────────
  if (/\bahora\b|\ben curso\b|\bahorita\b|\beste momento\b|\bestoy dictando\b/.test(texto)) {
    return { tipo: 'EN_CURSO' };
  }

  // ── Próxima clase ────────────────────────────────────────────────────────
  if (/\bproxima\b|\bproximo\b|\bsiguiente\b|\bque sigue\b|\bque viene\b|\bcuanto falta\b/.test(texto)) {
    return { tipo: 'PROXIMA' };
  }

  // ── "¿a qué hora tengo Programación II?" ─────────────────────────────────
  const materia = /\ba que hora (?:tengo|es|dicto|dan)\s+(?:la clase de\s+|clase de\s+|materia\s+)?(.+?)\s*\??$/.exec(
    texto,
  );
  if (materia?.[1]) {
    const termino = materia[1].trim();
    if (termino.length >= 3) return { tipo: 'MATERIA', termino };
  }

  // ── Franjas del día ──────────────────────────────────────────────────────
  // "después del almuerzo" es una hora real para un docente: la tarde.
  if (/\bdespues del almuerzo\b|\ben la tarde\b|\bpor la tarde\b|\besta tarde\b/.test(texto)) {
    const corte = new Date(hoy.getTime() + 13 * 60 * MS_MINUTO);
    return {
      tipo: 'RANGO',
      desde: corte,
      hasta: new Date(hoy.getTime() + MS_DIA),
      etiqueta: 'esta tarde (desde la 1:00 p. m.)',
    };
  }
  if (/\ben la manana\b|\bpor la manana\b|\besta manana\b|\bantes del almuerzo\b/.test(texto)) {
    return {
      tipo: 'RANGO',
      desde: hoy,
      hasta: new Date(hoy.getTime() + 13 * 60 * MS_MINUTO),
      etiqueta: 'esta mañana (hasta la 1:00 p. m.)',
    };
  }

  // ── Días relativos ───────────────────────────────────────────────────────
  if (/\bpasado manana\b/.test(texto)) {
    const inicio = new Date(hoy.getTime() + 2 * MS_DIA);
    return { tipo: 'RANGO', desde: inicio, hasta: new Date(inicio.getTime() + MS_DIA), etiqueta: 'pasado mañana' };
  }
  if (/\bmanana\b/.test(texto)) {
    const inicio = new Date(hoy.getTime() + MS_DIA);
    return { tipo: 'RANGO', desde: inicio, hasta: new Date(inicio.getTime() + MS_DIA), etiqueta: 'mañana' };
  }
  if (/\bayer\b/.test(texto)) {
    const inicio = new Date(hoy.getTime() - MS_DIA);
    return { tipo: 'RANGO', desde: inicio, hasta: hoy, etiqueta: 'ayer' };
  }

  // ── Semanas ──────────────────────────────────────────────────────────────
  if (/\bproxima semana\b|\bsemana que viene\b|\bsemana entrante\b/.test(texto)) {
    const inicio = new Date(inicioSemanaLocal(ahora, offsetMinutos).getTime() + 7 * MS_DIA);
    return {
      tipo: 'RANGO',
      desde: inicio,
      hasta: new Date(inicio.getTime() + 7 * MS_DIA),
      etiqueta: 'la próxima semana',
    };
  }
  if (/\besta semana\b|\bla semana\b/.test(texto)) {
    const inicio = inicioSemanaLocal(ahora, offsetMinutos);
    return {
      tipo: 'RANGO',
      desde: inicio,
      hasta: new Date(inicio.getTime() + 7 * MS_DIA),
      etiqueta: 'esta semana',
    };
  }
  if (/\beste mes\b/.test(texto)) {
    return {
      tipo: 'RANGO',
      desde: hoy,
      hasta: new Date(hoy.getTime() + 31 * MS_DIA),
      etiqueta: 'los próximos 31 días',
    };
  }

  // ── Día de la semana nombrado ────────────────────────────────────────────
  const dias: Array<[RegExp, number]> = [
    [/\blunes\b/, 1],
    [/\bmartes\b/, 2],
    [/\bmiercoles\b/, 3],
    [/\bjueves\b/, 4],
    [/\bviernes\b/, 5],
    [/\bsabado\b/, 6],
    [/\bdomingo\b/, 7],
  ];
  for (const [patron, dia] of dias) {
    if (!patron.test(texto)) continue;
    const lunes = inicioSemanaLocal(ahora, offsetMinutos);
    let inicio = new Date(lunes.getTime() + (dia - 1) * MS_DIA);
    // Un día ya pasado de esta semana se entiende como el de la que viene.
    if (inicio.getTime() + MS_DIA <= ahora.getTime()) inicio = new Date(inicio.getTime() + 7 * MS_DIA);
    return {
      tipo: 'RANGO',
      desde: inicio,
      hasta: new Date(inicio.getTime() + MS_DIA),
      etiqueta: texto.match(patron)?.[0] ?? 'ese día',
    };
  }

  // ── "hoy" explícito o por descarte ───────────────────────────────────────
  return { tipo: 'RANGO', desde: hoy, hasta: new Date(hoy.getTime() + MS_DIA), etiqueta: 'hoy' };
}

/** Hora de pared del campus, en formato 12 h, para un instante UTC. */
export function horaCampus(instante: Date, offsetMinutos: number): string {
  const desplazado = new Date(instante.getTime() + offsetMinutos * MS_MINUTO);
  const horas24 = desplazado.getUTCHours();
  const minutos = desplazado.getUTCMinutes();
  const sufijo = horas24 < 12 ? 'a. m.' : 'p. m.';
  const horas12 = horas24 % 12 === 0 ? 12 : horas24 % 12;
  return `${horas12}:${String(minutos).padStart(2, '0')} ${sufijo}`;
}

/** Texto humano de una espera: "32 minutos", "2 h 10 min", "3 días". */
export function tiempoRestante(minutos: number): string {
  if (minutos <= 0) return 'ya comenzó';
  if (minutos < 60) return `${minutos} minuto${minutos === 1 ? '' : 's'}`;
  if (minutos < 1440) {
    const horas = Math.floor(minutos / 60);
    const resto = minutos % 60;
    return resto === 0 ? `${horas} hora${horas === 1 ? '' : 's'}` : `${horas} h ${resto} min`;
  }
  const dias = Math.round(minutos / 1440);
  return `${dias} día${dias === 1 ? '' : 's'}`;
}

/** Filtro por texto de materia, tolerante a tildes y a nombres parciales. */
export function coincideMateria(nombre: string | undefined, termino: string): boolean {
  if (!nombre) return false;
  const objetivo = normalizarTexto(termino);
  if (objetivo.length < 3) return false;
  return normalizarTexto(nombre).includes(objetivo);
}

/** Reexportado para que quien consuma la intención no importe dos módulos. */
export { minutosDesdeMedianoche };
