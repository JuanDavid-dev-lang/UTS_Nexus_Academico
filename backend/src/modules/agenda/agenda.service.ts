/**
 * Construcción de la agenda académica.
 *
 * Junta en una sola lista tres cosas que ya existían por separado y que un
 * docente vive como una sola: el horario semanal (`Horario`), los eventos con
 * fecha (`EventoCalendario`) y las entregas (`Actividad`). No copia ninguna de
 * las tres: las lee, las expande y las devuelve con la misma forma.
 *
 * El alcance se aplica aquí, no en la ruta: un PROFESSOR ve lo suyo, un STUDENT
 * ve lo de las materias en las que está matriculado, y ADMIN/COORDINATOR ven
 * todo. Igual que `professor-scope.ts` hace con los estudiantes.
 */
import { ScheduleModel } from '../../models/schedule.model.js';
import { CalendarEventModel } from '../../models/calendar-event.model.js';
import { ActivityModel } from '../../models/activity.model.js';
import { SubjectModel } from '../../models/subject.model.js';
import { GroupModel } from '../../models/group.model.js';
import { UserModel } from '../../models/user.model.js';
import { EnrollmentModel } from '../../models/enrollment.model.js';
import { env } from '../../shared/env.js';
import {
  claseEnCurso,
  duracionEfectiva,
  estadoDeClase,
  expandirFranjas,
  inicioDiaLocal,
  minutosHasta,
  proximaClase,
  type FranjaSemanal,
} from '../../domains/agenda/agenda.service.js';

const MS_DIA = 86_400_000;

/** Tope del rango que se puede pedir de una vez. Un año de agenda no se dibuja. */
export const MAX_DIAS_RANGO = 120;

export type TipoAgenda =
  | 'CLASS'
  | 'EVALUATION'
  | 'EXAM'
  | 'DELIVERY'
  | 'ACTIVITY'
  | 'MEETING'
  | 'TUTORING'
  | 'ACADEMIC'
  | 'REMINDER';

export type AgendaItem = {
  /** Identidad estable. Para una clase incluye la fecha: `class:<horario>:<YYYY-MM-DD>`. */
  id: string;
  /** De dónde salió, para saber qué endpoint la edita. */
  origen: 'schedule' | 'event' | 'activity';
  /** Id del documento de origen. Una clase repetida comparte `sourceId` cada semana. */
  sourceId: string;
  kind: 'CLASS' | 'EVENT' | 'ACTIVITY';
  type: TipoAgenda;
  title: string;
  description: string;
  startAt: string;
  endAt: string;
  durationMinutes: number;
  allDay: boolean;
  /** Fecha local del campus, 'YYYY-MM-DD'. Es por la que agrupa el cliente. */
  date: string;
  subjectId: string | null;
  subjectName: string;
  subjectCode: string;
  groupId: string | null;
  groupName: string;
  teacherId: string | null;
  teacherName: string;
  classroom: string;
  modality: string;
  period: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  reminderMinutes: number[];
  status: 'PROXIMA' | 'EN_CURSO' | 'TERMINADA';
  editable: boolean;
};

export type AlcanceAgenda = {
  userId: string;
  role: string;
};

export type FiltroAgenda = {
  desde: Date;
  hasta: Date;
  subjectId?: string;
  groupId?: string;
  /** Restringe a ciertos tipos; vacío = todos. */
  tipos?: TipoAgenda[];
  /** Solo clases. Es la vista principal del calendario. */
  soloClases?: boolean;
};

/** Documento leído con `.lean()`: forma abierta, se lee campo a campo. */
type DocumentoPlano = Record<string, unknown> & { _id: unknown };

type FranjaHorario = FranjaSemanal & {
  subjectId: string | null;
  groupId: string | null;
  teacherId: string | null;
  classroom: string;
  modality: string;
};

/** Materias y grupos visibles para un STUDENT, vía su matrícula activa. */
async function alcanceEstudiante(userId: string): Promise<{ subjectIds: string[]; groupIds: string[] } | null> {
  const usuario = await UserModel.findById(userId).select('studentId').lean();
  if (!usuario?.studentId) return { subjectIds: [], groupIds: [] };

  const matriculas = await EnrollmentModel.find({
    studentId: usuario.studentId,
    deletedAt: null,
    enrollmentStatus: 'ACTIVE',
  })
    .select('subjectId groupId')
    .lean();

  return {
    subjectIds: [...new Set(matriculas.map(m => String(m.subjectId)).filter(Boolean))],
    groupIds: [...new Set(matriculas.map(m => String(m.groupId ?? '')).filter(Boolean))],
  };
}

/**
 * Agenda del usuario para un rango.
 *
 * Devuelve items ordenados por hora de inicio. Las clases ya vienen expandidas
 * a ocurrencias con fecha: el cliente no repite el cálculo, y por eso PC y
 * Android no pueden discrepar sobre a qué hora es una clase.
 */
export async function construirAgenda(
  alcance: AlcanceAgenda,
  filtro: FiltroAgenda,
): Promise<AgendaItem[]> {
  const offset = env.CAMPUS_UTC_OFFSET_MIN;
  const esDocente = alcance.role === 'PROFESSOR';
  const esEstudiante = alcance.role === 'STUDENT';

  const restriccion = esEstudiante ? await alcanceEstudiante(alcance.userId) : null;
  // ── Horario semanal ──────────────────────────────────────────────────────
  const filtroHorario: Record<string, unknown> = { deletedAt: null };
  if (esDocente) filtroHorario.teacherId = alcance.userId;
  if (restriccion) filtroHorario.subjectId = { $in: restriccion.subjectIds };
  if (filtro.subjectId) filtroHorario.subjectId = filtro.subjectId;
  if (filtro.groupId) filtroHorario.groupId = filtro.groupId;

  const horarios = await ScheduleModel.find(filtroHorario).lean();

  const franjas: FranjaHorario[] = horarios.map(horario => ({
    id: String(horario._id),
    dayOfWeek: Number(horario.dayOfWeek),
    startTime: String(horario.startTime ?? ''),
    endTime: String(horario.endTime ?? ''),
    durationMinutes: Number(horario.durationMinutes ?? 90),
    subjectId: horario.subjectId ? String(horario.subjectId) : null,
    groupId: horario.groupId ? String(horario.groupId) : null,
    teacherId: horario.teacherId ? String(horario.teacherId) : null,
    classroom: String(horario.classroom ?? ''),
    modality: String(horario.modality ?? 'PRESENTIAL'),
  }));

  const quiereClases = !filtro.tipos?.length || filtro.tipos.includes('CLASS');
  const ocurrencias = quiereClases ? expandirFranjas(franjas, filtro.desde, filtro.hasta, offset) : [];

  // ── Eventos y actividades ────────────────────────────────────────────────
  // `soloClases` es la vista principal del calendario: pedir los eventos para
  // luego tirarlos serían dos consultas de más en cada cambio de semana.
  const filtroEvento: Record<string, unknown> = {
    deletedAt: null,
    startAt: { $gte: filtro.desde, $lt: filtro.hasta },
  };
  if (esDocente) filtroEvento.$or = [{ teacherId: alcance.userId }, { visibility: 'INSTITUTIONAL' }];
  if (restriccion) {
    // Al estudiante le llegan los eventos de sus materias, nunca los
    // recordatorios personales de un docente.
    filtroEvento.$and = [
      { type: { $ne: 'REMINDER' } },
      { $or: [{ visibility: 'INSTITUTIONAL' }, { subjectId: { $in: restriccion.subjectIds } }] },
    ];
  }
  if (filtro.subjectId) filtroEvento.subjectId = filtro.subjectId;
  if (filtro.groupId) filtroEvento.groupId = filtro.groupId;

  const filtroActividad: Record<string, unknown> = {
    deletedAt: null,
    dueAt: { $gte: filtro.desde, $lt: filtro.hasta },
  };
  if (esDocente) filtroActividad.teacherId = alcance.userId;
  if (restriccion) filtroActividad.subjectId = { $in: restriccion.subjectIds };
  if (filtro.subjectId) filtroActividad.subjectId = filtro.subjectId;
  if (filtro.groupId) filtroActividad.groupId = filtro.groupId;

  const [eventos, actividades] = await Promise.all([
    filtro.soloClases
      ? Promise.resolve<DocumentoPlano[]>([])
      : (CalendarEventModel.find(filtroEvento).sort({ startAt: 1 }).limit(500).lean() as Promise<DocumentoPlano[]>),
    filtro.soloClases
      ? Promise.resolve<DocumentoPlano[]>([])
      : (ActivityModel.find(filtroActividad).sort({ dueAt: 1 }).limit(500).lean() as Promise<DocumentoPlano[]>),
  ]);

  // ── Nombres (una sola consulta por colección, no una por item) ───────────
  const subjectIds = new Set<string>();
  const groupIds = new Set<string>();
  const teacherIds = new Set<string>();

  for (const franja of franjas) {
    if (franja.subjectId) subjectIds.add(franja.subjectId);
    if (franja.groupId) groupIds.add(franja.groupId);
    if (franja.teacherId) teacherIds.add(franja.teacherId);
  }
  for (const evento of eventos) {
    if (evento.subjectId) subjectIds.add(String(evento.subjectId));
    if (evento.groupId) groupIds.add(String(evento.groupId));
    if (evento.teacherId) teacherIds.add(String(evento.teacherId));
  }
  for (const actividad of actividades) {
    if (actividad.subjectId) subjectIds.add(String(actividad.subjectId));
    if (actividad.groupId) groupIds.add(String(actividad.groupId));
    if (actividad.teacherId) teacherIds.add(String(actividad.teacherId));
  }

  const [materias, grupos, docentes] = await Promise.all([
    subjectIds.size
      ? SubjectModel.find({ _id: { $in: [...subjectIds] } }).select('name code period').lean()
      : Promise.resolve([]),
    groupIds.size ? GroupModel.find({ _id: { $in: [...groupIds] } }).select('name period').lean() : Promise.resolve([]),
    teacherIds.size ? UserModel.find({ _id: { $in: [...teacherIds] } }).select('fullName').lean() : Promise.resolve([]),
  ]);

  const materiaPorId = new Map(materias.map(m => [String(m._id), m]));
  const grupoPorId = new Map(grupos.map(g => [String(g._id), g]));
  const docentePorId = new Map(docentes.map(d => [String(d._id), d]));

  const ahora = new Date();
  const items: AgendaItem[] = [];

  for (const ocurrencia of ocurrencias) {
    const franja = ocurrencia.franja;
    const materia = franja.subjectId ? materiaPorId.get(franja.subjectId) : undefined;
    const grupo = franja.groupId ? grupoPorId.get(franja.groupId) : undefined;
    const docente = franja.teacherId ? docentePorId.get(franja.teacherId) : undefined;

    items.push({
      id: ocurrencia.id,
      origen: 'schedule',
      sourceId: franja.id,
      kind: 'CLASS',
      type: 'CLASS',
      title: String(materia?.name ?? 'Clase'),
      description: '',
      startAt: ocurrencia.startAt.toISOString(),
      endAt: ocurrencia.endAt.toISOString(),
      durationMinutes: ocurrencia.durationMinutes,
      allDay: false,
      date: ocurrencia.fecha,
      subjectId: franja.subjectId,
      subjectName: String(materia?.name ?? ''),
      subjectCode: String(materia?.code ?? ''),
      groupId: franja.groupId,
      groupName: String(grupo?.name ?? ''),
      teacherId: franja.teacherId,
      teacherName: String(docente?.fullName ?? ''),
      classroom: franja.classroom,
      modality: franja.modality,
      period: String(materia?.period ?? grupo?.period ?? ''),
      priority: 'MEDIUM',
      reminderMinutes: [],
      status: estadoDeClase(ocurrencia, ahora),
      // Una clase se edita en el horario, no en el calendario: cambiarla aquí
      // solo para ese día daría la ilusión de una excepción que el modelo no
      // guarda, y la semana siguiente volvería a la hora vieja.
      editable: !esEstudiante,
    });
  }

  for (const evento of eventos) {
    const inicio = new Date(evento.startAt as unknown as string);
    const duracion = evento.endAt
      ? Math.max(0, Math.round((new Date(evento.endAt as unknown as string).getTime() - inicio.getTime()) / 60_000))
      : 60;
    const fin = evento.endAt ? new Date(evento.endAt as unknown as string) : new Date(inicio.getTime() + duracion * 60_000);
    const materia = evento.subjectId ? materiaPorId.get(String(evento.subjectId)) : undefined;
    const grupo = evento.groupId ? grupoPorId.get(String(evento.groupId)) : undefined;
    const docente = evento.teacherId ? docentePorId.get(String(evento.teacherId)) : undefined;

    items.push({
      id: `event:${String(evento._id)}`,
      origen: 'event',
      sourceId: String(evento._id),
      kind: 'EVENT',
      type: String(evento.type) as TipoAgenda,
      title: String(evento.title ?? ''),
      description: String(evento.description ?? ''),
      startAt: inicio.toISOString(),
      endAt: fin.toISOString(),
      durationMinutes: duracion,
      allDay: evento.allDay === true,
      date: fechaLocal(inicio, offset),
      subjectId: evento.subjectId ? String(evento.subjectId) : null,
      subjectName: String(materia?.name ?? ''),
      subjectCode: String(materia?.code ?? ''),
      groupId: evento.groupId ? String(evento.groupId) : null,
      groupName: String(grupo?.name ?? ''),
      teacherId: evento.teacherId ? String(evento.teacherId) : null,
      teacherName: String(docente?.fullName ?? ''),
      classroom: String(evento.location ?? ''),
      modality: '',
      period: String(evento.period ?? materia?.period ?? ''),
      priority: (String(evento.priority ?? 'MEDIUM') as AgendaItem['priority']) ?? 'MEDIUM',
      reminderMinutes: Array.isArray(evento.reminderMinutes) ? evento.reminderMinutes.map(Number) : [],
      status: estadoDeClase({ startAt: inicio, endAt: fin }, ahora),
      editable: evento.visibility === 'INSTITUTIONAL'
        ? alcance.role === 'ADMIN'
        : !esEstudiante && (!esDocente || String(evento.teacherId) === alcance.userId),
    });
  }

  for (const actividad of actividades) {
    const inicio = new Date(actividad.dueAt as unknown as string);
    const materia = actividad.subjectId ? materiaPorId.get(String(actividad.subjectId)) : undefined;
    const grupo = actividad.groupId ? grupoPorId.get(String(actividad.groupId)) : undefined;
    const docente = actividad.teacherId ? docentePorId.get(String(actividad.teacherId)) : undefined;

    items.push({
      id: `activity:${String(actividad._id)}`,
      origen: 'activity',
      sourceId: String(actividad._id),
      kind: 'ACTIVITY',
      type: 'DELIVERY',
      title: String(actividad.title ?? ''),
      description: String(actividad.description ?? ''),
      startAt: inicio.toISOString(),
      endAt: inicio.toISOString(),
      durationMinutes: 0,
      allDay: false,
      date: fechaLocal(inicio, offset),
      subjectId: actividad.subjectId ? String(actividad.subjectId) : null,
      subjectName: String(materia?.name ?? ''),
      subjectCode: String(materia?.code ?? ''),
      groupId: actividad.groupId ? String(actividad.groupId) : null,
      groupName: String(grupo?.name ?? ''),
      teacherId: actividad.teacherId ? String(actividad.teacherId) : null,
      teacherName: String(docente?.fullName ?? ''),
      classroom: '',
      modality: '',
      period: String(materia?.period ?? ''),
      priority: 'HIGH',
      reminderMinutes: [],
      status: inicio.getTime() <= ahora.getTime() ? 'TERMINADA' : 'PROXIMA',
      // La entrega se administra donde ya se administraba: /activities.
      editable: false,
    });
  }

  const tipos = filtro.tipos?.length ? new Set(filtro.tipos) : null;
  const filtrados = tipos ? items.filter(item => tipos.has(item.type)) : items;

  filtrados.sort((a, b) => a.startAt.localeCompare(b.startAt));
  return filtrados;
}

function fechaLocal(instante: Date, offsetMinutos: number): string {
  const desplazado = new Date(instante.getTime() + offsetMinutos * 60_000);
  return `${desplazado.getUTCFullYear()}-${String(desplazado.getUTCMonth() + 1).padStart(2, '0')}-${String(
    desplazado.getUTCDate(),
  ).padStart(2, '0')}`;
}

export type ResumenAgenda = {
  ahora: string;
  /** Clase que está ocurriendo, con los minutos que le quedan. */
  enCurso: (AgendaItem & { minutosRestantes: number }) | null;
  /** Siguiente clase, con los minutos que faltan para que empiece. */
  proxima: (AgendaItem & { minutosPara: number }) | null;
  /** Todo lo de hoy, clases y eventos. */
  hoy: AgendaItem[];
  /** Lo siguiente que no es una clase (parciales, entregas, tutorías). */
  proximosEventos: AgendaItem[];
  totalHoy: number;
  totalSemana: number;
};

/**
 * Lo que necesita la tarjeta de "próxima clase" y el panel, en una llamada.
 *
 * Se resuelve en el servidor y no en el cliente porque los dos clientes tienen
 * que dar la misma respuesta: si Android calculara "la próxima" con su reloj y
 * PC con el suyo, un teléfono con la hora torcida mostraría otra clase.
 */
export async function resumenAgenda(alcance: AlcanceAgenda, ahora = new Date()): Promise<ResumenAgenda> {
  const offset = env.CAMPUS_UTC_OFFSET_MIN;
  const inicioHoy = inicioDiaLocal(ahora, offset);
  // Se mira una semana hacia delante: si un docente no tiene clase hasta el
  // lunes, "próxima clase: —" sería una respuesta peor que la verdadera.
  const hasta = new Date(inicioHoy.getTime() + 8 * MS_DIA);

  const items = await construirAgenda(alcance, { desde: inicioHoy, hasta });

  const clases = items.filter(item => item.kind === 'CLASS');
  const conFechas = clases.map(item => ({
    item,
    startAt: new Date(item.startAt),
    endAt: new Date(item.endAt),
  }));

  const actual = claseEnCurso(conFechas, ahora);
  const siguiente = proximaClase(conFechas, ahora);

  const hoyISO = fechaLocal(ahora, offset);
  const finSemana = new Date(inicioHoy.getTime() + 7 * MS_DIA);

  return {
    ahora: ahora.toISOString(),
    enCurso: actual
      ? { ...actual.item, minutosRestantes: Math.max(0, minutosHasta(actual.endAt, ahora)) }
      : null,
    proxima: siguiente ? { ...siguiente.item, minutosPara: minutosHasta(siguiente.startAt, ahora) } : null,
    hoy: items.filter(item => item.date === hoyISO),
    proximosEventos: items
      .filter(item => item.kind !== 'CLASS' && new Date(item.startAt).getTime() >= ahora.getTime())
      .slice(0, 10),
    totalHoy: items.filter(item => item.date === hoyISO).length,
    totalSemana: items.filter(item => new Date(item.startAt).getTime() < finSemana.getTime()).length,
  };
}

/** Duración declarada de una franja, reexportada para las rutas. */
export { duracionEfectiva };
