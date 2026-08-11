/**
 * La agenda real, para el asistente.
 *
 * Dos salidas del mismo dato:
 *
 *  - `contextoAgenda()` produce el bloque de texto que se le entrega al modelo
 *    local. Lleva horas absolutas y hora del campus ya resuelta, para que el
 *    modelo no tenga que calcular nada: lo único que hace es redactar.
 *  - `responderAgenda()` contesta sin modelo. Es la respuesta que se da cuando
 *    Ollama está caído, y también el suelo del sistema: un horario inventado
 *    manda a un docente a un aula equivocada, así que si la IA no está, se
 *    responde con reglas en lugar de no responder.
 */
import { construirAgenda, resumenAgenda, type AgendaItem, type AlcanceAgenda } from '../agenda/agenda.service.js';
import { env } from '../../shared/env.js';
import {
  detectarIntencionAgenda,
  horaCampus,
  tiempoRestante,
  coincideMateria,
  type IntencionAgenda,
} from '../../domains/agenda/agenda-questions.js';
import { inicioDiaLocal, minutosHasta } from '../../domains/agenda/agenda.service.js';

const MS_DIA = 86_400_000;

const ETIQUETA_TIPO: Record<string, string> = {
  CLASS: 'Clase',
  EVALUATION: 'Evaluación',
  EXAM: 'Parcial',
  DELIVERY: 'Entrega',
  ACTIVITY: 'Actividad',
  MEETING: 'Reunión',
  TUTORING: 'Tutoría',
  ACADEMIC: 'Evento',
  REMINDER: 'Recordatorio',
};

/** Una línea legible por item: "10:00 a. m. – 12:00 p. m. · Clase · … · Aula 304". */
export function lineaAgenda(item: AgendaItem, offset = env.CAMPUS_UTC_OFFSET_MIN): string {
  const inicio = new Date(item.startAt);
  const fin = new Date(item.endAt);
  const horas = item.allDay
    ? 'todo el día'
    : item.durationMinutes > 0
      ? `${horaCampus(inicio, offset)} – ${horaCampus(fin, offset)}`
      : horaCampus(inicio, offset);

  const partes = [
    horas,
    ETIQUETA_TIPO[item.type] ?? item.type,
    item.title || item.subjectName || 'Sin título',
    item.groupName && `grupo ${item.groupName}`,
    item.classroom && `aula ${item.classroom}`,
    item.teacherName && `docente ${item.teacherName}`,
  ].filter(Boolean);

  return `- ${partes.join(' · ')}`;
}

/**
 * Bloque de contexto para el modelo: hoy, mañana y el resto de la semana.
 *
 * Se limita a nueve días y a lo que hay: si no hay clases, lo dice. Un contexto
 * vacío sin esa frase invita al modelo a rellenar el hueco.
 */
export async function contextoAgenda(alcance: AlcanceAgenda, ahora = new Date()): Promise<string> {
  const offset = env.CAMPUS_UTC_OFFSET_MIN;
  const inicioHoy = inicioDiaLocal(ahora, offset);
  const [items, resumen] = await Promise.all([
    construirAgenda(alcance, { desde: inicioHoy, hasta: new Date(inicioHoy.getTime() + 9 * MS_DIA) }),
    resumenAgenda(alcance, ahora),
  ]);

  if (items.length === 0) {
    return 'AGENDA: el docente no tiene clases ni eventos registrados en los próximos nueve días.';
  }

  const porFecha = new Map<string, AgendaItem[]>();
  for (const item of items) {
    const lista = porFecha.get(item.date);
    if (lista) lista.push(item);
    else porFecha.set(item.date, [item]);
  }

  const lineas: string[] = ['AGENDA REAL (hora del campus, no la recalcules):'];

  if (resumen.enCurso) {
    lineas.push(
      `- AHORA MISMO en curso: ${resumen.enCurso.title} ` +
        `(${horaCampus(new Date(resumen.enCurso.startAt), offset)} – ${horaCampus(new Date(resumen.enCurso.endAt), offset)}` +
        `${resumen.enCurso.classroom ? `, aula ${resumen.enCurso.classroom}` : ''}), ` +
        `termina en ${tiempoRestante(resumen.enCurso.minutosRestantes)}.`,
    );
  } else {
    lineas.push('- No hay ninguna clase en curso en este momento.');
  }

  if (resumen.proxima) {
    lineas.push(
      `- PRÓXIMA clase: ${resumen.proxima.title} el ${resumen.proxima.date} a las ` +
        `${horaCampus(new Date(resumen.proxima.startAt), offset)}` +
        `${resumen.proxima.classroom ? `, aula ${resumen.proxima.classroom}` : ''}; ` +
        `comienza en ${tiempoRestante(resumen.proxima.minutosPara)}.`,
    );
  } else {
    lineas.push('- No hay ninguna clase próxima en los siguientes nueve días.');
  }

  for (const [fecha, delDia] of [...porFecha.entries()].slice(0, 9)) {
    lineas.push('', `${fecha}:`);
    for (const item of delDia) lineas.push(lineaAgenda(item, offset));
  }

  return lineas.join('\n');
}

/** Encabezado humano de un rango. */
function tituloRango(intencion: Extract<IntencionAgenda, { tipo: 'RANGO' }>): string {
  return `Esto es lo que tienes ${intencion.etiqueta}`;
}

/**
 * Respuesta determinista a una pregunta de agenda. `null` si la pregunta no va
 * de agenda y debe seguir su camino normal.
 */
export async function responderAgenda(
  pregunta: string,
  alcance: AlcanceAgenda,
  ahora = new Date(),
): Promise<string | null> {
  const offset = env.CAMPUS_UTC_OFFSET_MIN;
  const intencion = detectarIntencionAgenda(pregunta, ahora, offset);
  if (!intencion) return null;

  if (intencion.tipo === 'PROXIMA' || intencion.tipo === 'EN_CURSO') {
    const resumen = await resumenAgenda(alcance, ahora);

    if (intencion.tipo === 'EN_CURSO') {
      if (!resumen.enCurso) return 'Ahora mismo no tienes ninguna clase en curso.';
      const clase = resumen.enCurso;
      return (
        `Tienes ${clase.title} en curso: ${horaCampus(new Date(clase.startAt), offset)} – ` +
        `${horaCampus(new Date(clase.endAt), offset)}` +
        `${clase.classroom ? `, aula ${clase.classroom}` : ''}. ` +
        `Termina en ${tiempoRestante(clase.minutosRestantes)}.`
      );
    }

    if (!resumen.proxima) return 'No tienes ninguna clase programada en los próximos días.';
    const clase = resumen.proxima;
    return (
      `Tu próxima clase es ${clase.title}: ${clase.date}, ` +
      `${horaCampus(new Date(clase.startAt), offset)} – ${horaCampus(new Date(clase.endAt), offset)}` +
      `${clase.classroom ? `, aula ${clase.classroom}` : ''}` +
      `${clase.groupName ? `, grupo ${clase.groupName}` : ''}. ` +
      `Comienza en ${tiempoRestante(clase.minutosPara)}.`
    );
  }

  if (intencion.tipo === 'MATERIA') {
    const inicioHoy = inicioDiaLocal(ahora, offset);
    const items = await construirAgenda(alcance, {
      desde: inicioHoy,
      hasta: new Date(inicioHoy.getTime() + 9 * MS_DIA),
    });
    const coincidencias = items.filter(
      item => coincideMateria(item.subjectName, intencion.termino) || coincideMateria(item.title, intencion.termino),
    );
    if (coincidencias.length === 0) {
      return `No encuentro nada llamado "${intencion.termino}" en tu agenda de los próximos nueve días. Puede que la materia se llame distinto en el sistema.`;
    }
    const proxima = coincidencias.find(item => new Date(item.startAt).getTime() > ahora.getTime());
    const cabecera = proxima
      ? `La próxima es el ${proxima.date} a las ${horaCampus(new Date(proxima.startAt), offset)}` +
        `${proxima.classroom ? `, aula ${proxima.classroom}` : ''} (en ${tiempoRestante(
          minutosHasta(new Date(proxima.startAt), ahora),
        )}).`
      : 'No queda ninguna sesión próxima en los siguientes nueve días.';
    return [cabecera, '', 'Todas las sesiones encontradas:', ...coincidencias.map(item => `${item.date} ${lineaAgenda(item, offset)}`)].join('\n');
  }

  // ── Rango de fechas ──────────────────────────────────────────────────────
  const items = await construirAgenda(alcance, { desde: intencion.desde, hasta: intencion.hasta });
  if (items.length === 0) {
    return `No tienes clases ni eventos ${intencion.etiqueta}.`;
  }

  const porFecha = new Map<string, AgendaItem[]>();
  for (const item of items) {
    const lista = porFecha.get(item.date);
    if (lista) lista.push(item);
    else porFecha.set(item.date, [item]);
  }

  const cuerpo: string[] = [`${tituloRango(intencion)}:`];
  const variosDias = porFecha.size > 1;
  for (const [fecha, delDia] of porFecha) {
    if (variosDias) cuerpo.push('', fecha);
    for (const item of delDia) cuerpo.push(lineaAgenda(item, offset));
  }
  return cuerpo.join('\n');
}
