/**
 * Recordatorios de clase y de eventos de la agenda.
 *
 * Corre en el scheduler cada minuto (`CLASS_REMINDER_INTERVAL_MIN`). En cada
 * pasada mira solo la ventana siguiente —no recorre estudiantes ni recalcula
 * nada académico—, así que su coste es una consulta al horario más una por
 * docente con clase próxima.
 *
 * El control de duplicados NO está aquí sino en la clave: cada aviso se
 * identifica por "esta clase, este día, esta antelación". Dos pasadas que se
 * solapen, un reinicio del proceso a mitad de minuto o dos instancias del
 * backend escriben la misma clave y el índice único deja pasar una sola.
 */
import { ScheduleModel } from '../../models/schedule.model.js';
import { CalendarEventModel } from '../../models/calendar-event.model.js';
import { SubjectModel } from '../../models/subject.model.js';
import { GroupModel } from '../../models/group.model.js';
import { env } from '../../shared/env.js';
import {
  avisoEnVentana,
  expandirFranjas,
  minutosHasta,
  type FranjaSemanal,
} from '../../domains/agenda/agenda.service.js';
import { crearNotificacion, obtenerPreferencias } from '../../shared/notify.js';

const MS_MINUTO = 60_000;

/** Antelación máxima soportada: un día. Marca cuánto hay que mirar hacia delante. */
const MAX_ANTELACION_MIN = 1440;

export type ResultadoRecordatorios = {
  clasesRevisadas: number;
  eventosRevisados: number;
  avisos: number;
  duplicados: number;
};

type FranjaConDatos = FranjaSemanal & {
  subjectId: string | null;
  groupId: string | null;
  teacherId: string;
  classroom: string;
};

/** Texto del aviso según lo que falte. Es lo que se lee en la pantalla bloqueada. */
function mensajeClase(nombre: string, antelacion: number, aula: string, grupo: string): string {
  const donde = [aula && `Aula ${aula}`, grupo && `Grupo ${grupo}`].filter(Boolean).join(' · ');
  const sufijo = donde ? ` (${donde})` : '';

  if (antelacion === 0) return `${nombre} comienza ahora${sufijo}.`;
  if (antelacion === 1440) return `Mañana tienes ${nombre}${sufijo}.`;
  if (antelacion >= 60) {
    const horas = Math.round(antelacion / 60);
    return `${nombre} comienza en ${horas} hora${horas === 1 ? '' : 's'}${sufijo}.`;
  }
  return `${nombre} comienza en ${antelacion} minutos${sufijo}.`;
}

const ETIQUETA_EVENTO: Record<string, string> = {
  EVALUATION: 'Evaluación',
  EXAM: 'Parcial',
  DELIVERY: 'Entrega',
  ACTIVITY: 'Actividad',
  MEETING: 'Reunión',
  TUTORING: 'Tutoría',
  ACADEMIC: 'Evento académico',
  REMINDER: 'Recordatorio',
};

function mensajeEvento(titulo: string, tipo: string, antelacion: number): string {
  const etiqueta = ETIQUETA_EVENTO[tipo] ?? 'Evento';
  if (antelacion === 0) return `${etiqueta}: ${titulo} — comienza ahora.`;
  if (antelacion === 1440) return `${etiqueta} mañana: ${titulo}.`;
  if (antelacion >= 60) {
    const horas = Math.round(antelacion / 60);
    return `${etiqueta} en ${horas} hora${horas === 1 ? '' : 's'}: ${titulo}.`;
  }
  return `${etiqueta} en ${antelacion} minutos: ${titulo}.`;
}

/**
 * Una pasada de recordatorios.
 *
 * `ahora` y `ventanaMinutos` son parámetros para poder ejecutarla a mano desde
 * un endpoint de diagnóstico con una ventana ancha, sin tocar el scheduler.
 */
export async function generarRecordatorios(
  ahora = new Date(),
  ventanaMinutos = Math.max(1, env.CLASS_REMINDER_INTERVAL_MIN || 1),
): Promise<ResultadoRecordatorios> {
  const offset = env.CAMPUS_UTC_OFFSET_MIN;
  const resultado: ResultadoRecordatorios = {
    clasesRevisadas: 0,
    eventosRevisados: 0,
    avisos: 0,
    duplicados: 0,
  };

  const hasta = new Date(ahora.getTime() + (MAX_ANTELACION_MIN + ventanaMinutos) * MS_MINUTO);

  // Preferencias en memoria durante la pasada: un docente con seis clases hoy
  // no debe provocar seis lecturas del mismo documento.
  const cachePreferencias = new Map<string, Awaited<ReturnType<typeof obtenerPreferencias>>>();
  const preferenciasDe = async (userId: string) => {
    const previa = cachePreferencias.get(userId);
    if (previa) return previa;
    const preferencias = await obtenerPreferencias(userId);
    cachePreferencias.set(userId, preferencias);
    return preferencias;
  };

  // ── Clases ───────────────────────────────────────────────────────────────
  const horarios = await ScheduleModel.find({ deletedAt: null })
    .select('subjectId groupId teacherId dayOfWeek startTime endTime durationMinutes classroom')
    .lean();

  const franjas: FranjaConDatos[] = horarios
    .filter(horario => horario.teacherId)
    .map(horario => ({
      id: String(horario._id),
      dayOfWeek: Number(horario.dayOfWeek),
      startTime: String(horario.startTime ?? ''),
      endTime: String(horario.endTime ?? ''),
      durationMinutes: Number(horario.durationMinutes ?? 90),
      subjectId: horario.subjectId ? String(horario.subjectId) : null,
      groupId: horario.groupId ? String(horario.groupId) : null,
      teacherId: String(horario.teacherId),
      classroom: String(horario.classroom ?? ''),
    }));

  const ocurrencias = expandirFranjas(franjas, ahora, hasta, offset);
  resultado.clasesRevisadas = ocurrencias.length;

  const subjectIds = new Set<string>();
  const groupIds = new Set<string>();
  for (const ocurrencia of ocurrencias) {
    if (ocurrencia.franja.subjectId) subjectIds.add(ocurrencia.franja.subjectId);
    if (ocurrencia.franja.groupId) groupIds.add(ocurrencia.franja.groupId);
  }

  const [materias, grupos] = await Promise.all([
    subjectIds.size ? SubjectModel.find({ _id: { $in: [...subjectIds] } }).select('name').lean() : Promise.resolve([]),
    groupIds.size ? GroupModel.find({ _id: { $in: [...groupIds] } }).select('name').lean() : Promise.resolve([]),
  ]);
  const nombreMateria = new Map(materias.map(m => [String(m._id), String(m.name ?? '')]));
  const nombreGrupo = new Map(grupos.map(g => [String(g._id), String(g.name ?? '')]));

  for (const ocurrencia of ocurrencias) {
    const franja = ocurrencia.franja;
    const preferencias = await preferenciasDe(franja.teacherId);
    if (!preferencias.clases) continue;

    // `0` siempre entra: "comienza ahora" es el aviso que evita llegar tarde
    // cuando el de antelación se perdió por tener el teléfono apagado.
    const antelaciones = [...new Set([...preferencias.classLeadMinutes, 0])].filter(
      minutos => minutos >= 0 && minutos <= MAX_ANTELACION_MIN,
    );

    for (const antelacion of antelaciones) {
      if (!avisoEnVentana(ocurrencia.startAt, antelacion, ahora, ventanaMinutos)) continue;

      const nombre = (franja.subjectId && nombreMateria.get(franja.subjectId)) || 'Tu clase';
      const grupo = (franja.groupId && nombreGrupo.get(franja.groupId)) || '';

      const salida = await crearNotificacion({
        userId: franja.teacherId,
        type: 'CLASS',
        priority: antelacion === 0 ? 'IMPORTANT' : 'INFO',
        title: antelacion === 0 ? 'Clase en curso' : 'Próxima clase',
        message: mensajeClase(nombre, antelacion, franja.classroom, grupo),
        dedupeKey: `class:${franja.id}:${ocurrencia.fecha}:${antelacion}`,
        link: `/agenda?item=${encodeURIComponent(ocurrencia.id)}`,
        metadata: {
          agendaItemId: ocurrencia.id,
          scheduleId: franja.id,
          subjectId: franja.subjectId ?? '',
          groupId: franja.groupId ?? '',
          classroom: franja.classroom,
          startAt: ocurrencia.startAt.toISOString(),
          endAt: ocurrencia.endAt.toISOString(),
          leadMinutes: antelacion,
        },
      });

      if (salida.creada) resultado.avisos += 1;
      else if (salida.omitida === 'duplicada') resultado.duplicados += 1;
    }
  }

  // ── Eventos del calendario ───────────────────────────────────────────────
  const eventos = await CalendarEventModel.find({
    deletedAt: null,
    startAt: { $gte: ahora, $lt: hasta },
    reminderMinutes: { $exists: true, $ne: [] },
  })
    .select('title type startAt teacherId subjectId reminderMinutes priority location')
    .lean();

  resultado.eventosRevisados = eventos.length;

  for (const evento of eventos) {
    const teacherId = String(evento.teacherId ?? '');
    if (!teacherId) continue;

    const preferencias = await preferenciasDe(teacherId);
    const categoriaActiva =
      evento.type === 'REMINDER' ? preferencias.recordatorios
        : evento.type === 'EXAM' || evento.type === 'EVALUATION' || evento.type === 'DELIVERY'
          ? preferencias.evaluaciones
          : preferencias.eventos;
    if (!categoriaActiva) continue;

    const inicio = new Date(evento.startAt as unknown as string);
    const antelaciones = Array.isArray(evento.reminderMinutes)
      ? (evento.reminderMinutes as unknown[]).map(Number).filter(n => Number.isFinite(n) && n >= 0)
      : [];

    for (const antelacion of antelaciones) {
      if (antelacion > MAX_ANTELACION_MIN) continue;
      if (!avisoEnVentana(inicio, antelacion, ahora, ventanaMinutos)) continue;

      const tipoEvento = String(evento.type ?? 'ACADEMIC');
      const prioridad = String(evento.priority ?? 'MEDIUM');

      const salida = await crearNotificacion({
        userId: teacherId,
        type: tipoEvento === 'EXAM' || tipoEvento === 'EVALUATION' ? 'EXAM' : tipoEvento === 'DELIVERY' ? 'DEADLINE' : 'EVENT',
        priority: prioridad === 'URGENT' ? 'URGENT' : prioridad === 'HIGH' ? 'IMPORTANT' : 'INFO',
        title: ETIQUETA_EVENTO[tipoEvento] ?? 'Evento',
        message: mensajeEvento(String(evento.title ?? ''), tipoEvento, antelacion),
        dedupeKey: `event:${String(evento._id)}:${antelacion}`,
        link: `/agenda?item=${encodeURIComponent(`event:${String(evento._id)}`)}`,
        metadata: {
          agendaItemId: `event:${String(evento._id)}`,
          eventId: String(evento._id),
          subjectId: evento.subjectId ? String(evento.subjectId) : '',
          startAt: inicio.toISOString(),
          leadMinutes: antelacion,
          minutosPara: minutosHasta(inicio, ahora),
        },
      });

      if (salida.creada) resultado.avisos += 1;
      else if (salida.omitida === 'duplicada') resultado.duplicados += 1;
    }
  }

  return resultado;
}
