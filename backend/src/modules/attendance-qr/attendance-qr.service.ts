/**
 * Asistencia por QR: abrir la clase, leer lo que escanean los estudiantes en
 * UniPlanner y escribir la asistencia sin que el docente toque nada.
 *
 * El recorrido de una marca:
 *
 *   1. El docente abre la sesión. Se leen de una vez los enlaces de UniPlanner
 *      de todos los matriculados —la misma lectura que la lista de clase— y la
 *      sesión se publica en Firestore.
 *   2. El estudiante escanea. UniPlanner crea `attendance_sessions/{id}/checkins/{uid}`
 *      con el texto del QR; sus reglas exigen que la marca sea de su cuenta y
 *      sellan la hora con la del servidor.
 *   3. El lector (`procesarSesionesAbiertas`, cada pocos segundos) trae lo nuevo
 *      y `domains/attendance/qr-session.ts` decide. Si vale, **no se escribe
 *      todavía**: se le contesta con una vista previa —su nombre y su documento
 *      como los tiene la universidad, la materia, el grupo— para que confirme
 *      que es él y que es su clase. Si ya estaba presente hoy, se le dice y no
 *      se escribe nada.
 *   4. Al confirmar, se escribe en `asistencias` con `origen: 'QR'` y se le
 *      contesta en la propia marca, que es lo que está mirando.
 *   5. Al cerrar —el docente o el reloj—, quien no escaneó o no confirmó y no
 *      tenía marca de ese día queda ausente. Lo que el docente ya había
 *      marcado a mano no se toca.
 *
 * **La identidad nunca la dice el teléfono.** La marca solo lleva el QR; quién
 * es sale de la cuenta que la creó y del mapa cuenta → estudiante que se armó
 * con los enlaces de los matriculados. Un estudiante está en varias materias y
 * tiene un solo enlace: aparece en el mapa de cada una de sus clases, y en el
 * de ninguna más.
 */
import { randomBytes } from 'node:crypto';
import { Types } from 'mongoose';
import { AttendanceSessionModel, type MotivoCierre } from '../../models/attendance-session.model.js';
import { AttendanceModel } from '../../models/attendance.model.js';
import { QrBindingModel } from '../../models/qr-binding.model.js';
import { EnrollmentModel } from '../../models/enrollment.model.js';
import { GroupModel } from '../../models/group.model.js';
import { ScheduleModel } from '../../models/schedule.model.js';
import { StudentModel } from '../../models/student.model.js';
import { SubjectModel } from '../../models/subject.model.js';
import * as puente from '../../shared/uniplanner.js';
import { env } from '../../shared/env.js';
import { auditChange } from '../../shared/audit.js';
import { emitToUser } from '../../shared/socket.js';
import { getProfessorScope } from '../../shared/professor-scope.js';
import { estadoDePeriodo, exigirPeriodoAbierto } from '../../shared/period-guard.js';
import { fechaDeClaseDelDia, hoyEnElCampus } from '../../shared/class-date.js';
import { puedeEscribir } from '../../domains/periods/period-lifecycle.js';
import { idDeEnlace } from '../../domains/uniplanner/link-id.js';
import {
  componerQr,
  confirmacionValida,
  enmascararDocumento,
  esReintentoValido,
  agotoIntentos,
  evaluarLote,
  finDeVentana,
  horaDePared,
  MENSAJE_DE_RECHAZO,
  MENSAJE_YA_REGISTRADA,
  MOTIVO_YA_REGISTRADA,
  SEGUNDOS_POR_VENTANA,
  ventanaDe,
  type MotivoRechazo,
} from '../../domains/attendance/qr-session.js';
import { debeRenovarBloqueo, finDelBloqueo } from '../../domains/periods/period-calendar.js';
import { AcademicPeriodModel } from '../../models/academic-period.model.js';
import { claveInstitucional, nombreDelDocente } from '../uniplanner/uniplanner.service.js';

/** Cada cuánto se leen las marcas nuevas mientras hay una sesión abierta. */
export const SEGUNDOS_ENTRE_LECTURAS = 3;

/**
 * Cada cuánto se buscan en la base sesiones abiertas que este proceso no
 * conoce: las de otra instancia, o las que quedaron abiertas en un reinicio.
 */
const MS_ENTRE_BARRIDOS = 60_000;

/** Cuántas respuestas se escriben por pasada. El resto, en la siguiente. */
const RESPUESTAS_POR_PASADA = 60;

/** Sesiones que el lector atiende a la vez en cada pasada. */
const SESIONES_EN_PARALELO = 8;

/** Error con `statusCode`, para que `error.ts` lo traduzca y no caiga a 500. */
export class ErrorDeSesionQr extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'ErrorDeSesionQr';
  }
}

type Actor = { id: string; role: string };

type Enlace = {
  studentId: Types.ObjectId;
  linkId: string;
  uid: string;
  bloqueadoHasta: Date | null;
};

type EstadoMarca = 'PENDIENTE' | 'ACEPTADA' | 'RECHAZADA';

type Marca = {
  uid: string;
  studentId: Types.ObjectId | null;
  deviceId: string;
  creadaEn: Date;
  estado: EstadoMarca;
  /** Un `MotivoRechazo`, o `YA_REGISTRADA` en una aceptada que no escribió nada. */
  motivo: string | null;
  confirmadaEn?: Date | null;
  respondida: boolean;
  intentos?: number;
};

/** Aceptada sin escribir: ya tenía asistencia de esa materia ese día. */
const yaRegistrada = (m: Marca) => m.estado === 'ACEPTADA' && m.motivo === MOTIVO_YA_REGISTRADA;

/** Las que ocupan a su estudiante y su teléfono en esta sesión. */
const reserva = (m: Marca) => m.estado === 'PENDIENTE' || (m.estado === 'ACEPTADA' && !yaRegistrada(m));

type Sesion = {
  _id: Types.ObjectId;
  subjectId: Types.ObjectId;
  groupId: Types.ObjectId | null;
  teacherId: Types.ObjectId;
  abiertaPor: Types.ObjectId;
  period: string;
  date: Date;
  durationMinutes: number;
  institutionId: string;
  estado: 'ABIERTA' | 'CERRADA';
  abiertaEn: Date;
  cierraEn: Date;
  cerradaEn: Date | null;
  motivoCierre: MotivoCierre | null;
  marcarAusentes: boolean;
  ausentesMarcados: number;
  secreto?: string;
  visibles: { materia: string; grupo: string; hora: string };
  nombreMateria?: string;
  nombreDocente?: string;
  bloqueoHasta?: Date | null;
  matriculados: { studentId: Types.ObjectId; groupId: Types.ObjectId | null }[];
  enlaces: Enlace[];
  marcas: Marca[];
  cursor: Date | null;
  cursorConfirmaciones?: Date | null;
  revision?: number;
};

const oid = (id: string | Types.ObjectId) => new Types.ObjectId(String(id));

function cargar(id: string, conSecreto = false): Promise<Sesion | null> {
  const consulta = AttendanceSessionModel.findById(id);
  if (conSecreto) consulta.select('+secreto');
  return consulta.lean<Sesion>().exec();
}

/**
 * Un docente ve las sesiones que abrió o las de sus materias. Si no, **404**:
 * un 403 confirmaría que ese id existe.
 */
function exigirAcceso(sesion: Sesion | null, actor: Actor): Sesion {
  if (!sesion) throw new ErrorDeSesionQr(404, 'Sesión de asistencia no encontrada.');
  if (actor.role === 'ADMIN') return sesion;
  if (String(sesion.teacherId) === actor.id || String(sesion.abiertaPor) === actor.id) return sesion;
  throw new ErrorDeSesionQr(404, 'Sesión de asistencia no encontrada.');
}

/** Avisa a quien la mira. Por su sala: el nombre de la clase no es de todos. */
function avisar(sesion: Pick<Sesion, '_id' | 'teacherId' | 'abiertaPor' | 'subjectId'>, conAsistencia: boolean) {
  const destinatarios = [...new Set([String(sesion.teacherId), String(sesion.abiertaPor)])];
  for (const usuario of destinatarios) {
    emitToUser(usuario, 'sync:update', {
      entity: 'attendanceSession',
      action: 'update',
      id: String(sesion._id),
    });
    if (conAsistencia) {
      emitToUser(usuario, 'sync:update', {
        entity: 'attendance',
        action: 'bulk',
        id: String(sesion.subjectId),
      });
    }
  }
}

// ── Serializar el trabajo sobre una sesión ───────────────────────────────────
//
// El lector y el botón de cerrar pueden llegar a la vez. Sin esto, el cierre
// escribiría los ausentes mientras el lector escribe como presente a alguien
// que escaneó en el último segundo, y el resultado dependería de cuál llegara
// antes a Atlas.

const colas = new Map<string, Promise<unknown>>();

function enSerie<T>(id: string, tarea: () => Promise<T>): Promise<T> {
  const previa = colas.get(id) ?? Promise.resolve();
  const siguiente = previa.catch(() => undefined).then(tarea);
  const cola = siguiente.catch(() => undefined);
  colas.set(id, cola);
  void cola.then(() => {
    if (colas.get(id) === cola) colas.delete(id);
  });
  return siguiente;
}

// ── Enlaces ──────────────────────────────────────────────────────────────────

/** Los enlaces de UniPlanner de unos estudiantes, en una sola lectura. */
async function leerEnlaces(
  institucion: string,
  estudiantes: { _id: unknown; code?: unknown }[],
): Promise<Enlace[]> {
  const estudiantePorEnlace = new Map<string, string>();
  for (const estudiante of estudiantes) {
    const id = idDeEnlace(institucion, String(estudiante.code ?? ''));
    if (id) estudiantePorEnlace.set(id, String(estudiante._id));
  }

  const encontrados = await puente.buscarEnlaces([...estudiantePorEnlace.keys()]);
  const enlaces: Enlace[] = [];
  for (const [linkId, enlace] of encontrados) {
    const studentId = estudiantePorEnlace.get(linkId);
    if (!studentId) continue;
    // Con el canal en «solo verificados», un enlace sin confirmar no identifica
    // a nadie: tampoco para marcar asistencia.
    if (env.UNIPLANNER_SOLO_VERIFICADOS && !enlace.verified) continue;
    enlaces.push({ studentId: oid(studentId), linkId, uid: enlace.uid, bloqueadoHasta: enlace.bloqueadoHasta });
  }
  return enlaces;
}

/**
 * Vuelve a mirar a los matriculados que no tenían enlace.
 *
 * Es el caso de quien instala UniPlanner en la propia clase, después de que el
 * docente abrió el QR. Sin esto su marca se rechazaría como «no matriculado»
 * aunque lo esté.
 */
async function refrescarEnlaces(sesion: Sesion): Promise<Enlace[]> {
  const conEnlace = new Set(sesion.enlaces.map((e) => String(e.studentId)));
  const sinEnlace = sesion.matriculados.map((m) => m.studentId).filter((id) => !conEnlace.has(String(id)));
  if (sinEnlace.length === 0) return sesion.enlaces;

  const estudiantes = await StudentModel.find({ _id: { $in: sinEnlace }, deletedAt: null })
    .select('code')
    .lean();
  const nuevos = await leerEnlaces(sesion.institutionId, estudiantes);
  return [...sesion.enlaces, ...nuevos];
}

// ── Abrir ────────────────────────────────────────────────────────────────────

export type AbrirSesion = {
  subjectId: string;
  /** El grupo al que se pasa lista. Obligatorio. */
  groupId: string;
  scheduleId?: string;
  minutos: number;
  marcarAusentes: boolean;
};

/**
 * Abre la sesión de una clase de hoy.
 *
 * Si la materia ya tiene una abierta, devuelve esa: abrir dos veces la misma
 * clase —un doble clic, la pantalla que se recarga— daría dos QR válidos y dos
 * listas que se pisan.
 */
export async function abrirSesion(
  input: AbrirSesion,
  actor: Actor,
): Promise<{ id: string; existente: boolean }> {
  if (!puente.configurado()) {
    throw new ErrorDeSesionQr(
      409,
      'El puente con UniPlanner no está configurado en este servidor: no se puede pasar lista por QR.',
    );
  }

  const materia = await SubjectModel.findOne({ _id: input.subjectId, deletedAt: null })
    .select('name code period professorId')
    .lean();
  if (!materia) throw new ErrorDeSesionQr(404, 'Materia no encontrada.');

  // **La lista es de un grupo**, no de la materia, y el grupo se pide siempre:
  // en la UTS una materia (PIS701) tiene varios grupos (A194, A193, B212) con
  // estudiantes, horario y a veces docente distintos. Sin grupo, el QR juntaba
  // a todos, el estudiante no veía su grupo en la confirmación y al cerrar
  // quedaban ausentes los de un grupo que ese día no tenía clase.
  const grupo = await GroupModel.findOne({ _id: input.groupId, subjectId: materia._id, deletedAt: null })
    .select('name period')
    .lean();
  if (!grupo) throw new ErrorDeSesionQr(404, 'Ese grupo no es de esta materia.');
  const grupoId = String(grupo._id);

  if (actor.role === 'PROFESSOR') {
    const alcance = await getProfessorScope(actor.id);
    if (!alcance.subjectIds.includes(input.subjectId)) {
      throw new ErrorDeSesionQr(403, 'Esa materia no está asignada a tu cuenta.');
    }
    if (grupoId && !alcance.groupIds.includes(grupoId)) {
      throw new ErrorDeSesionQr(403, 'Ese grupo no está asignado a tu cuenta.');
    }
  }

  const teacherId = actor.role === 'PROFESSOR' ? actor.id : String(materia.professorId);
  const period = String(grupo?.period ?? materia.period);
  await exigirPeriodoAbierto(period, 'attendance');

  // La de este docente: dos docentes de la misma materia (grupos distintos,
  // un suplente) abren cada uno la suya.
  const abierta = await AttendanceSessionModel.findOne({
    subjectId: materia._id,
    groupId: grupo._id,
    teacherId: oid(teacherId),
    estado: 'ABIERTA',
  })
    .select('_id cierraEn')
    .lean();
  if (abierta) {
    if (abierta.cierraEn.getTime() > Date.now()) return { id: String(abierta._id), existente: true };
    // Vencida y todavía sin cerrar: el lector aún no pasó. Se cierra ahora
    // para que la nueva no conviva con una que sigue escribiendo.
    await cerrarSesion(String(abierta._id), null);
  }

  const institucion = await claveInstitucional(input.subjectId);
  if (!institucion) {
    throw new ErrorDeSesionQr(
      409,
      'No se sabe a qué institución pertenece esta materia, y sin eso no se encuentra a nadie en UniPlanner.',
    );
  }

  // Un docente pasa lista a **sus** matriculados: sin esto veía nombre y código
  // de los grupos de otro docente de la misma materia y, al cerrar, los dejaba
  // ausentes un día en que no tenían clase con él.
  const matriculas = await EnrollmentModel.find({
    subjectId: materia._id,
    period,
    enrollmentStatus: 'ACTIVE',
    deletedAt: null,
    ...(grupo ? { groupId: grupo._id } : {}),
    ...(actor.role === 'PROFESSOR' ? { professorId: oid(actor.id) } : {}),
  })
    .select('studentId groupId')
    .lean();

  const matriculados = new Map<string, { studentId: Types.ObjectId; groupId: Types.ObjectId | null }>();
  for (const m of matriculas) {
    matriculados.set(String(m.studentId), {
      studentId: m.studentId as Types.ObjectId,
      groupId: (m.groupId as Types.ObjectId | null) ?? null,
    });
  }
  if (matriculados.size === 0) {
    throw new ErrorDeSesionQr(409, 'No hay estudiantes matriculados en esta clase.');
  }

  const [estudiantes, horario, docente, periodoDoc] = await Promise.all([
    StudentModel.find({ _id: { $in: [...matriculados.values()].map((m) => m.studentId) }, deletedAt: null })
      .select('code')
      .lean(),
    input.scheduleId
      ? ScheduleModel.findOne({ _id: input.scheduleId, subjectId: materia._id, deletedAt: null })
          .select('startTime durationMinutes')
          .lean()
      : null,
    nombreDelDocente(teacherId),
    AcademicPeriodModel.findOne({ period }).select('endsOn').lean<{ endsOn?: string | null } | null>(),
  ]);
  const enlaces = await leerEnlaces(institucion, estudiantes);

  const ahora = new Date();
  const cierraEn = new Date(ahora.getTime() + input.minutos * 60_000);
  const visibles = {
    materia: String(materia.code ?? ''),
    grupo: String(grupo?.name ?? ''),
    hora: horario?.startTime ?? horaDePared(ahora, env.CAMPUS_UTC_OFFSET_MIN),
  };

  const datosDeSesion = {
    subjectId: materia._id,
    groupId: grupo?._id ?? null,
    scheduleId: horario?._id ?? null,
    teacherId: oid(teacherId),
    abiertaPor: oid(actor.id),
    period,
    date: fechaDeClaseDelDia(hoyEnElCampus(ahora)),
    durationMinutes: Number(horario?.durationMinutes ?? 90),
    institutionId: institucion,
    abiertaEn: ahora,
    cierraEn,
    marcarAusentes: input.marcarAusentes,
    secreto: randomBytes(32).toString('hex'),
    visibles,
    nombreMateria: String(materia.name ?? ''),
    nombreDocente: docente ?? '',
    bloqueoHasta: finDelBloqueo({
      periodo: period,
      finConfigurado: periodoDoc?.endsOn ?? null,
      ahora,
      offsetMinutos: env.CAMPUS_UTC_OFFSET_MIN,
    }),
    matriculados: [...matriculados.values()],
    enlaces,
  };
  let creada;
  try {
    creada = await AttendanceSessionModel.create(datosDeSesion);
  } catch (err) {
    // El índice único cerró la carrera del doble clic: la otra petición ya la
    // abrió, y esta devuelve esa.
    if ((err as { code?: number }).code !== 11000) throw err;
    const ganadora = await AttendanceSessionModel.findOne({
      subjectId: materia._id,
      groupId: grupo._id,
      teacherId: oid(teacherId),
      estado: 'ABIERTA',
    })
      .select('_id')
      .lean();
    if (!ganadora) throw err;
    return { id: String(ganadora._id), existente: true };
  }
  const id = String(creada._id);

  const publicada = await puente.publicarSesion(id, {
    institutionId: institucion,
    courseCode: visibles.materia,
    courseName: String(materia.name ?? ''),
    group: visibles.grupo,
    teacherName: docente ?? '',
    term: period,
    startsAt: ahora,
    closesAt: cierraEn,
  });
  if (!publicada) {
    // Sin la sesión en Firestore las reglas de UniPlanner no dejan crear
    // ninguna marca: un QR en pantalla que nadie puede usar es peor que un
    // error ahora.
    await AttendanceSessionModel.deleteOne({ _id: creada._id });
    throw new ErrorDeSesionQr(
      424,
      'No se pudo publicar la clase en UniPlanner. Revisa la conexión del servidor e inténtalo de nuevo.',
    );
  }

  activas.add(id);
  avisar(creada, false);
  await auditChange({
    actorId: actor.id,
    action: 'CREATE',
    entity: 'SesionAsistencia',
    entityId: id,
    before: null,
    after: {
      subjectId: input.subjectId,
      groupId: grupoId,
      period,
      minutos: input.minutos,
      marcarAusentes: input.marcarAusentes,
      matriculados: matriculados.size,
      conUniPlanner: enlaces.length,
    },
  });

  return { id, existente: false };
}

// ── Leer y decidir ───────────────────────────────────────────────────────────

/** Estudiantes con asistencia **presente** de esta materia en este día. */
async function presentesDelDia(sesion: Sesion, studentIds: string[]): Promise<Set<string>> {
  if (studentIds.length === 0) return new Set();
  const filas = await AttendanceModel.find({
    subjectId: sesion.subjectId,
    date: sesion.date,
    present: true,
    deletedAt: null,
    studentId: { $in: studentIds.map(oid) },
  })
    .select('studentId')
    .lean();
  return new Set(filas.map((f) => String(f.studentId)));
}

/**
 * Estudiantes a los que el docente ya marcó **a mano** durante esta sesión
 * (ausente, o con su planilla). Su confirmación desde el teléfono no pisa esa
 * decisión: si el docente ve «confirmando» a alguien que no está en el salón y
 * lo marca ausente, la confirmación que llegue después desde el teléfono de un
 * amigo no lo deja presente.
 */
async function decididasPorDocente(sesion: Sesion, studentIds: string[]): Promise<Set<string>> {
  if (studentIds.length === 0) return new Set();
  const filas = await AttendanceModel.find({
    subjectId: sesion.subjectId,
    date: sesion.date,
    present: false,
    deletedAt: null,
    origen: { $ne: 'QR' },
    updatedAt: { $gte: sesion.abiertaEn },
    studentId: { $in: studentIds.map(oid) },
  })
    .select('studentId')
    .lean();
  return new Set(filas.map((f) => String(f.studentId)));
}

/**
 * Quién marcó por quién en este periodo (`QrBindingModel`), para las cuentas
 * y los estudiantes de esta tanda. Es lo que hace valer el bloqueo del enlace
 * aunque el enlace se borre y se recree en UniPlanner.
 */
async function vinculosDelSemestre(
  period: string,
  uids: string[],
  studentIds: string[],
): Promise<{ porUid: Map<string, string>; porEstudiante: Map<string, string> }> {
  const porUid = new Map<string, string>();
  const porEstudiante = new Map<string, string>();
  if (uids.length === 0 && studentIds.length === 0) return { porUid, porEstudiante };
  const filas = await QrBindingModel.find({
    period,
    $or: [{ uid: { $in: uids } }, { studentId: { $in: studentIds.map(oid) } }],
  })
    .select('uid studentId')
    .lean();
  for (const fila of filas) {
    porUid.set(fila.uid, String(fila.studentId));
    porEstudiante.set(String(fila.studentId), fila.uid);
  }
  return { porUid, porEstudiante };
}

/**
 * Ata cada cuenta al estudiante por el que acaba de quedar presente, para el
 * resto del periodo. `$setOnInsert`: el primer vínculo manda. Un choque con los
 * índices únicos solo puede venir de dos confirmaciones cruzadas en el mismo
 * instante, y entonces el que ya estaba se conserva.
 */
async function atarVinculos(sesion: Sesion, pares: { studentId: string; uid: string }[]): Promise<void> {
  if (pares.length === 0) return;
  try {
    await QrBindingModel.bulkWrite(
      pares.map(({ studentId, uid }) => ({
        updateOne: {
          filter: { period: sesion.period, studentId: oid(studentId) },
          update: { $setOnInsert: { uid, institutionId: sesion.institutionId, sessionId: sesion._id } },
          upsert: true,
        },
      })),
      { ordered: false },
    );
  } catch (err) {
    // Clave duplicada de una carrera: lo demás de la tanda ya se escribió.
    if ((err as { code?: number }).code !== 11000) throw err;
  }
}

/**
 * Trae de Firestore lo que llegó desde la última lectura —marcas nuevas y
 * confirmaciones—, lo decide y lo escribe. Devuelve si escribió alguna
 * asistencia.
 */
async function procesarMarcas(sesion: Sesion): Promise<boolean> {
  const id = String(sesion._id);
  const [nuevasLeidas, confirmadasLeidas] = await Promise.all([
    puente.leerMarcas(id, sesion.cursor, 'createdAt'),
    puente.leerMarcas(id, sesion.cursorConfirmaciones ?? null, 'confirmedAt'),
  ]);

  let marcas = [...sesion.marcas];
  let enlaces = sesion.enlaces;
  let cursor = sesion.cursor;
  let cursorConfirmaciones = sesion.cursorConfirmaciones ?? null;
  const presentes: string[] = [];
  /** Si la lista de marcas cambió. Sin cambios no se escribe la sesión. */
  let marcasCambiaron = false;

  // ── 1. Marcas nuevas: vista previa, «ya registrada» o rechazo ─────────────
  if (nuevasLeidas.ok) {
    cursor = nuevasLeidas.marcas.at(-1)?.creadaEn ?? cursor;
    // Una cuenta ya vista solo vuelve a evaluarse si su marca anterior se
    // rechazó o quedó sin confirmar, y esta es un intento posterior.
    const previaPorUid = new Map(marcas.map((m) => [m.uid, m]));
    const nuevas = nuevasLeidas.marcas.filter((m) => {
      const previa = previaPorUid.get(m.uid);
      return !previa || esReintentoValido(previa, m);
    });

    // Pasado el tope no se evalúa, pero se contesta una vez: sin respuesta la
    // marca se quedaba «esperando» en el teléfono para siempre.
    const agotadas = nuevasLeidas.marcas.filter((m) => {
      const previa = previaPorUid.get(m.uid);
      return previa && agotoIntentos(previa, m);
    });
    if (agotadas.length > 0) {
      const porUid = new Map(agotadas.map((m) => [m.uid, m]));
      marcas = marcas.map((m) => {
        const nueva = porUid.get(m.uid);
        return nueva
          ? { ...m, creadaEn: nueva.creadaEn, estado: 'RECHAZADA', motivo: 'DEMASIADOS_INTENTOS', respondida: false }
          : m;
      });
      marcasCambiaron = true;
    }

    if (nuevas.length > 0) {
      if (nuevas.some((m) => !enlaces.some((e) => e.uid === m.uid))) {
        enlaces = await refrescarEnlaces(sesion);
      }
      const reintentos = new Set(nuevas.filter((m) => previaPorUid.has(m.uid)).map((m) => m.uid));
      marcas = marcas.filter((m) => !reintentos.has(m.uid));
      marcasCambiaron = true;

      const estudiantesPorUid = new Map<string, string[]>();
      for (const enlace of enlaces) {
        const lista = estudiantesPorUid.get(enlace.uid) ?? [];
        lista.push(String(enlace.studentId));
        estudiantesPorUid.set(enlace.uid, lista);
      }
      const candidatos = nuevas.flatMap((m) => estudiantesPorUid.get(m.uid) ?? []);
      const reservadas = marcas.filter(reserva);

      const [yaPresentes, vinculos] = await Promise.all([
        presentesDelDia(sesion, candidatos),
        vinculosDelSemestre(sesion.period, nuevas.map((m) => m.uid), candidatos),
      ]);
      const decisiones = evaluarLote(nuevas, {
        sesionId: id,
        secreto: String(sesion.secreto),
        abiertaEn: sesion.abiertaEn,
        cierraEn: sesion.cierraEn,
        estudiantesPorUid,
        aceptadas: new Set(reservadas.map((m) => String(m.studentId))),
        dispositivos: new Map(reservadas.filter((m) => m.deviceId).map((m) => [m.deviceId, m.uid])),
        yaPresentes,
        vinculos,
      });

      for (const { marca, decision } of decisiones) {
        const intentos = (previaPorUid.get(marca.uid)?.intentos ?? 0) + 1;
        const base = { uid: marca.uid, deviceId: marca.deviceId, creadaEn: marca.creadaEn, respondida: false, intentos };
        if (!decision.aceptada) {
          marcas.push({
            ...base,
            studentId: decision.studentId ? oid(decision.studentId) : null,
            estado: 'RECHAZADA',
            motivo: decision.motivo,
          });
        } else if (decision.yaRegistrada) {
          marcas.push({ ...base, studentId: oid(decision.studentId), estado: 'ACEPTADA', motivo: MOTIVO_YA_REGISTRADA });
        } else {
          // Vale, pero no se escribe hasta que confirme que es él y es su clase.
          marcas.push({ ...base, studentId: oid(decision.studentId), estado: 'PENDIENTE', motivo: null });
        }
      }
    }
  }

  // ── 2. Confirmaciones: ahora sí se escribe ───────────────────────────────
  if (confirmadasLeidas.ok) {
    cursorConfirmaciones = confirmadasLeidas.marcas.at(-1)?.confirmadaEn ?? cursorConfirmaciones;
    const confirmadas = confirmadasLeidas.marcas.filter((leida) =>
      marcas.some((m) => m.uid === leida.uid && m.estado === 'PENDIENTE' && leida.confirmadaEn),
    );

    if (confirmadas.length > 0) {
      // Entre la vista previa y la confirmación el docente pudo marcarlo a
      // mano: entonces no se pisa su marca, se le dice que ya estaba.
      const pendientesIds = confirmadas.flatMap((leida) => {
        const marca = marcas.find((m) => m.uid === leida.uid);
        return marca?.studentId ? [String(marca.studentId)] : [];
      });
      const [yaPresentes, decididas] = await Promise.all([
        presentesDelDia(sesion, pendientesIds),
        decididasPorDocente(sesion, pendientesIds),
      ]);
      marcasCambiaron = true;

      marcas = marcas.map((m) => {
        const leida = confirmadas.find((c) => c.uid === m.uid);
        if (!leida || m.estado !== 'PENDIENTE' || !leida.confirmadaEn) return m;
        if (!confirmacionValida(leida.confirmadaEn, sesion)) {
          return { ...m, estado: 'RECHAZADA', motivo: 'SESION_CERRADA', confirmadaEn: leida.confirmadaEn, respondida: false };
        }
        const studentId = String(m.studentId);
        if (yaPresentes.has(studentId)) {
          return { ...m, estado: 'ACEPTADA', motivo: MOTIVO_YA_REGISTRADA, confirmadaEn: leida.confirmadaEn, respondida: false };
        }
        if (decididas.has(studentId)) {
          return { ...m, estado: 'RECHAZADA', motivo: 'DECIDIDA_POR_DOCENTE', confirmadaEn: leida.confirmadaEn, respondida: false };
        }
        presentes.push(studentId);
        return { ...m, estado: 'ACEPTADA', motivo: null, confirmadaEn: leida.confirmadaEn, respondida: false };
      });
    }
  }

  if (presentes.length > 0) {
    await escribirPresentes(sesion, presentes);
    const uidDe = new Map(marcas.filter((m) => m.studentId).map((m) => [String(m.studentId), m.uid]));
    await atarVinculos(
      sesion,
      presentes.flatMap((studentId) => (uidDe.has(studentId) ? [{ studentId, uid: uidDe.get(studentId)! }] : [])),
    );
    enlaces = await renovarBloqueos(enlaces, presentes, sesion);
  }

  const cambio =
    marcasCambiaron ||
    enlaces !== sesion.enlaces ||
    cursor?.getTime() !== sesion.cursor?.getTime() ||
    cursorConfirmaciones?.getTime() !== sesion.cursorConfirmaciones?.getTime();
  if (!cambio) {
    // Nada nuevo: solo se reintentan las respuestas que no llegaron. Una
    // pasada vacía no escribe en la base.
    await responderPendientes(sesion, marcas);
    return false;
  }

  // La revisión evita pisar la lista si otra instancia la escribió entre la
  // lectura y aquí. La asistencia ya escrita es idempotente; la lista no.
  const escrito = await AttendanceSessionModel.updateOne(
    { _id: sesion._id, revision: sesion.revision ?? 0 },
    { $set: { marcas, cursor, cursorConfirmaciones, enlaces }, $inc: { revision: 1 } },
  );
  if (escrito.modifiedCount === 0) return presentes.length > 0;

  avisar(sesion, presentes.length > 0);
  await responderPendientes({ ...sesion, revision: (sesion.revision ?? 0) + 1 }, marcas);
  return presentes.length > 0;
}

/**
 * Presente a quien confirmó.
 *
 * `$set` solo del estado y el origen: si el docente ya había anotado un retraso
 * o una observación a mano, se conservan. `lateMinutes` **no se deduce** de la
 * hora del escaneo: esa hora dice cuándo apuntó la cámara, no cuándo llegó.
 */
async function escribirPresentes(sesion: Sesion, studentIds: string[]): Promise<void> {
  const grupoDe = new Map(sesion.matriculados.map((m) => [String(m.studentId), m.groupId]));

  await AttendanceModel.bulkWrite(
    studentIds.map((studentId) => ({
      updateOne: {
        // `bulkWrite` no castea: con el id en texto el filtro no casaría con
        // nada y el upsert crearía un duplicado en vez de actualizar.
        filter: { studentId: oid(studentId), subjectId: sesion.subjectId, date: sesion.date },
        update: {
          $set: { present: true, origen: 'QR', deletedAt: null },
          $setOnInsert: {
            groupId: grupoDe.get(studentId) ?? sesion.groupId ?? null,
            teacherId: sesion.teacherId,
            period: sesion.period,
            durationMinutes: sesion.durationMinutes,
            lateMinutes: 0,
            notes: '',
          },
        },
        upsert: true,
      },
    })),
    { ordered: false },
  );

  // Una entrada por tanda, no una por estudiante: lo que ocurrió fue «estos
  // confirmaron», y veinte filas idénticas esconden esa única acción.
  // `entityId` es la sesión y no «materia:fecha»: la auditoría lo guarda como
  // ObjectId, y un texto ahí no falla la petición — solo deja la entrada sin
  // escribir, que es peor.
  await auditChange({
    actorId: null,
    action: 'UPDATE',
    entity: 'Asistencia',
    entityId: String(sesion._id),
    before: null,
    after: {
      origen: 'QR',
      subjectId: String(sesion.subjectId),
      date: sesion.date.toISOString(),
      presentes: studentIds,
    },
  });
}

/**
 * Fija el enlace de quien acaba de confirmar hasta el fin del semestre.
 *
 * El fin es el mismo para todas las clases del semestre, así que se escribe
 * una vez por estudiante y semestre, no en cada clase: sería una escritura por
 * clase en el proyecto de otra aplicación para repetir la misma fecha.
 */
async function renovarBloqueos(
  enlaces: Enlace[],
  studentIds: string[],
  sesion: Pick<Sesion, 'period' | 'bloqueoHasta'>,
): Promise<Enlace[]> {
  // Sesiones abiertas antes de este campo: se calcula con la fecha por defecto.
  const hasta =
    sesion.bloqueoHasta ??
    finDelBloqueo({ periodo: sesion.period, finConfigurado: null, ahora: new Date(), offsetMinutos: env.CAMPUS_UTC_OFFSET_MIN });
  const marcaron = new Set(studentIds);
  const resultado: Enlace[] = [];

  for (const enlace of enlaces) {
    if (!marcaron.has(String(enlace.studentId)) || !debeRenovarBloqueo(enlace.bloqueadoHasta, hasta)) {
      resultado.push(enlace);
      continue;
    }
    const ok = await puente.bloquearEnlace(enlace.linkId, hasta);
    resultado.push(ok ? { ...enlace, bloqueadoHasta: hasta } : enlace);
  }
  return resultado;
}

/** Lo que se le escribe en la marca, según en qué punto esté. */
async function respuestasPara(sesion: Sesion, marcas: Marca[]) {
  const pendientes = marcas.filter((m) => m.estado === 'PENDIENTE' && m.studentId);
  const estudiantes = pendientes.length
    ? await StudentModel.find({ _id: { $in: pendientes.map((m) => m.studentId) } })
        .select('fullName code')
        .lean()
    : [];
  const porId = new Map(estudiantes.map((e) => [String(e._id), e]));

  return (marca: Marca): ((id: string) => Promise<boolean>) => {
    if (marca.estado === 'PENDIENTE') {
      const estudiante = porId.get(String(marca.studentId));
      return (id) =>
        puente.responderVistaPrevia(id, marca.uid, {
          studentName: String(estudiante?.fullName ?? ''),
          studentDocument: enmascararDocumento(String(estudiante?.code ?? '')),
          courseName: sesion.nombreMateria ?? '',
          courseCode: sesion.visibles.materia,
          group: sesion.visibles.grupo,
          startTime: sesion.visibles.hora,
          teacherName: sesion.nombreDocente ?? '',
        });
    }
    if (marca.estado === 'ACEPTADA') {
      return (id) =>
        puente.responderMarca(
          id,
          marca.uid,
          yaRegistrada(marca)
            ? { status: 'accepted', reason: MOTIVO_YA_REGISTRADA, message: MENSAJE_YA_REGISTRADA }
            : { status: 'accepted', reason: null, message: 'Asistencia registrada.' },
        );
    }
    return (id) =>
      puente.responderMarca(id, marca.uid, {
        status: 'rejected',
        reason: marca.motivo,
        message: MENSAJE_DE_RECHAZO[marca.motivo as MotivoRechazo] ?? 'Marca rechazada.',
      });
  };
}

/**
 * Contesta en Firestore las marcas que aún no tienen respuesta en su estado
 * actual: la vista previa a las pendientes, el resultado a las demás.
 *
 * Un fallo de red no pierde la respuesta: la marca queda `respondida: false` y
 * se reintenta en la pasada siguiente. La asistencia ya está escrita; lo que
 * falta es que el estudiante lo vea.
 */
async function responderPendientes(sesion: Sesion, marcas: Marca[]): Promise<void> {
  const pendientes = marcas.filter((m) => !m.respondida).slice(0, RESPUESTAS_POR_PASADA);
  if (pendientes.length === 0) return;

  const id = String(sesion._id);
  const respuesta = await respuestasPara(sesion, pendientes);
  const respondidas: { uid: string; estado: EstadoMarca }[] = [];
  for (let i = 0; i < pendientes.length; i += 10) {
    const tanda = pendientes.slice(i, i + 10);
    const resultados = await Promise.all(tanda.map((marca) => respuesta(marca)(id)));
    tanda.forEach((marca, j) => {
      if (resultados[j]) respondidas.push({ uid: marca.uid, estado: marca.estado });
    });
  }

  // Por estado: marcar como contestada una vista previa no debe marcar
  // también el resultado que llegue después para la misma cuenta.
  for (const estado of ['PENDIENTE', 'ACEPTADA', 'RECHAZADA'] as const) {
    const uids = respondidas.filter((r) => r.estado === estado).map((r) => r.uid);
    if (uids.length === 0) continue;
    await AttendanceSessionModel.updateOne(
      { _id: sesion._id },
      { $set: { 'marcas.$[m].respondida': true } },
      { arrayFilters: [{ 'm.uid': { $in: uids }, 'm.estado': estado }] },
    );
  }
}

// ── Cerrar ───────────────────────────────────────────────────────────────────

/**
 * Ausente a quien no escaneó **y no tenía marca de ese día**.
 *
 * Solo `$setOnInsert`: lo que el docente ya marcó a mano —el que no tiene
 * teléfono, el que llegó y se le marcó presente— no se pisa.
 */
async function escribirAusentes(sesion: Sesion): Promise<number> {
  const presentes = new Set(
    sesion.marcas.filter((m) => m.estado === 'ACEPTADA').map((m) => String(m.studentId)),
  );
  const faltan = sesion.matriculados.filter((m) => !presentes.has(String(m.studentId)));
  if (faltan.length === 0) return 0;

  const resultado = await AttendanceModel.bulkWrite(
    faltan.map((m) => ({
      updateOne: {
        filter: { studentId: m.studentId, subjectId: sesion.subjectId, date: sesion.date },
        update: {
          $setOnInsert: {
            present: false,
            origen: 'QR',
            groupId: m.groupId ?? sesion.groupId ?? null,
            teacherId: sesion.teacherId,
            period: sesion.period,
            durationMinutes: sesion.durationMinutes,
            lateMinutes: 0,
            notes: '',
          },
        },
        upsert: true,
      },
    })),
    { ordered: false },
  );
  return resultado.upsertedCount;
}

/** Cierra una sesión ya cargada. Se llama siempre dentro de `enSerie`. */
async function cerrarInterno(sesion: Sesion, actorId: string | null, motivo: MotivoCierre): Promise<void> {
  const id = String(sesion._id);
  const cerradaEn = new Date(Math.min(Date.now(), sesion.cierraEn.getTime()));

  // Con el periodo en cierre no se escribe nada más: la marca quedaría fuera
  // de la fotografía del semestre.
  const escribible = puedeEscribir(await estadoDePeriodo(sesion.period), 'attendance');
  const motivoFinal: MotivoCierre = escribible ? motivo : 'PERIODO';

  // Primero se cierra allá, para que las reglas no admitan marcas nuevas, y
  // después se lee lo último que llegó hasta ese momento. Si falla, se anota y
  // el barrido lo reintenta: con la sesión abierta allá las reglas seguirían
  // admitiendo marcas que aquí ya nadie lee.
  const cerradaAlla = await puente.cerrarSesionPublicada(id, cerradaEn);

  let ausentes = 0;
  let escribio = false;
  if (escribible) escribio = await procesarMarcas({ ...sesion, cierraEn: cerradaEn });

  const actual = await cargar(id);
  if (actual) {
    // Quien vio su vista previa y no confirmó no queda presente, y se le dice:
    // si sigue mirando el teléfono, no puede quedarse esperando para siempre.
    if (actual.marcas.some((m) => m.estado === 'PENDIENTE')) {
      // Solo las que siguen pendientes **en la base**: reescribir la lista
      // entera podía deshacer una confirmación que otra instancia aceptó entre
      // la lectura y esta escritura.
      await AttendanceSessionModel.updateOne(
        { _id: sesion._id },
        {
          $set: {
            'marcas.$[m].estado': 'RECHAZADA',
            'marcas.$[m].motivo': 'SIN_CONFIRMAR',
            'marcas.$[m].respondida': false,
          },
          $inc: { revision: 1 },
        },
        { arrayFilters: [{ 'm.estado': 'PENDIENTE' }] },
      );
      const recargada = await cargar(id);
      if (recargada) {
        await responderPendientes(recargada, recargada.marcas);
        actual.marcas = recargada.marcas;
      }
    }
    if (escribible && actual.marcarAusentes) ausentes = await escribirAusentes(actual);
  }

  await AttendanceSessionModel.updateOne(
    { _id: sesion._id, estado: 'ABIERTA' },
    {
      $set: {
        estado: 'CERRADA',
        cierraEn: cerradaEn,
        cerradaEn,
        cerradaPor: actorId ? oid(actorId) : null,
        motivoCierre: motivoFinal,
        ausentesMarcados: ausentes,
        cierrePendiente: !cerradaAlla,
      },
    },
  );
  activas.delete(id);
  avisar(sesion, escribio || ausentes > 0);

  const final = await cargar(id);
  await auditChange({
    actorId,
    action: 'UPDATE',
    entity: 'SesionAsistencia',
    entityId: id,
    before: { estado: 'ABIERTA' },
    after: {
      estado: 'CERRADA',
      motivo: motivoFinal,
      presentes: final?.marcas.filter((m) => m.estado === 'ACEPTADA').length ?? 0,
      rechazadas: final?.marcas.filter((m) => m.estado === 'RECHAZADA').length ?? 0,
      ausentesMarcados: ausentes,
    },
  });
}

/**
 * Cierra la sesión ahora. `actor` nulo = la cierra el sistema.
 *
 * Idempotente: cerrar una cerrada no hace nada y devuelve lo que ya había.
 */
export async function cerrarSesion(id: string, actor: Actor | null): Promise<void> {
  await enSerie(id, async () => {
    const sesion = await cargar(id, true);
    if (actor) exigirAcceso(sesion, actor);
    if (!sesion || sesion.estado !== 'ABIERTA') return;
    await cerrarInterno(sesion, actor?.id ?? null, actor ? 'DOCENTE' : 'VENCIDA');
  });
}

/** Una pasada del lector sobre una sesión. */
async function procesarSesion(id: string): Promise<void> {
  await enSerie(id, async () => {
    const sesion = await cargar(id, true);
    if (!sesion || sesion.estado !== 'ABIERTA') {
      activas.delete(id);
      return;
    }

    const vencida = Date.now() > sesion.cierraEn.getTime();
    const escribible = puedeEscribir(await estadoDePeriodo(sesion.period), 'attendance');
    if (vencida || !escribible) {
      await cerrarInterno(sesion, null, 'VENCIDA');
      return;
    }
    await procesarMarcas(sesion);
  });
}

// ── Lector ───────────────────────────────────────────────────────────────────

/** Sesiones abiertas que este proceso tiene que leer. */
const activas = new Set<string>();
let ultimoBarrido = 0;

/**
 * Una pasada del lector sobre todas las sesiones abiertas.
 *
 * Cada pocos segundos pregunta a Firestore por lo nuevo de cada sesión que
 * conoce. A la base solo va una vez por minuto, a buscar las que no conoce: las
 * que abrió otra instancia o las que quedaron abiertas tras un reinicio. Sin
 * sesiones abiertas no hace ninguna llamada a Firestore.
 */
export async function procesarSesionesAbiertas(): Promise<{ sesiones: number }> {
  if (Date.now() - ultimoBarrido > MS_ENTRE_BARRIDOS) {
    ultimoBarrido = Date.now();
    const abiertas = await AttendanceSessionModel.find({ estado: 'ABIERTA' }).select('_id').lean();
    for (const sesion of abiertas) activas.add(String(sesion._id));
    await reintentarCierresPublicados();
  }

  // Varias a la vez, con tope: en serie, sesenta clases a las siete tardaban
  // más de una pasada, y un solo tiempo de espera de Firestore retrasaba a
  // todas las demás.
  const pendientes = [...activas];
  const trabajar = async () => {
    for (let id = pendientes.shift(); id; id = pendientes.shift()) {
      try {
        await procesarSesion(id);
      } catch (err) {
        console.warn(`[asistencia-qr] fallo procesando la sesión ${id}:`, err instanceof Error ? err.message : err);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(SESIONES_EN_PARALELO, pendientes.length) }, trabajar));
  return { sesiones: activas.size };
}

/**
 * Cierra en Firestore las sesiones que aquí se cerraron y allá no (un fallo de
 * red al cerrar). Sin esto las reglas seguían admitiendo marcas hasta
 * `closesAt` y quedaban sin contestar.
 */
async function reintentarCierresPublicados(): Promise<void> {
  const pendientes = await AttendanceSessionModel.find({ estado: 'CERRADA', cierrePendiente: true })
    .select('_id cerradaEn')
    .limit(50)
    .lean<{ _id: Types.ObjectId; cerradaEn: Date | null }[]>();
  for (const sesion of pendientes) {
    const ok = await puente.cerrarSesionPublicada(String(sesion._id), sesion.cerradaEn ?? new Date());
    if (ok) await AttendanceSessionModel.updateOne({ _id: sesion._id }, { $set: { cierrePendiente: false } });
  }
}

// ── Lectura para el docente ──────────────────────────────────────────────────

export async function sesionesAbiertas(actor: Actor, subjectId?: string) {
  const filtro: Record<string, unknown> = { estado: 'ABIERTA' };
  if (actor.role === 'PROFESSOR') filtro.$or = [{ teacherId: oid(actor.id) }, { abiertaPor: oid(actor.id) }];
  if (subjectId) filtro.subjectId = oid(subjectId);

  const sesiones = await AttendanceSessionModel.find(filtro)
    .select('_id subjectId groupId cierraEn')
    .sort({ abiertaEn: -1 })
    .limit(20)
    .lean();
  return sesiones.map((s) => ({
    id: String(s._id),
    subjectId: String(s.subjectId),
    groupId: s.groupId ? String(s.groupId) : null,
  }));
}

/** Estado de la sesión y de cada matriculado, para la pantalla del proyector. */
export async function vistaDeSesion(id: string, actor: Actor) {
  const sesion = exigirAcceso(await cargar(id), actor);

  const [materia, estudiantes] = await Promise.all([
    SubjectModel.findById(sesion.subjectId).select('name code').lean(),
    StudentModel.find({ _id: { $in: sesion.matriculados.map((m) => m.studentId) } })
      .select('fullName code photoUrl')
      .lean(),
  ]);

  const nombrePorId = new Map(estudiantes.map((e) => [String(e._id), String(e.fullName ?? '')]));
  const conEnlace = new Set(sesion.enlaces.map((e) => String(e.studentId)));
  const aceptadaPorId = new Map(
    sesion.marcas.filter((m) => m.estado === 'ACEPTADA').map((m) => [String(m.studentId), m]),
  );
  const pendientes = new Set(
    sesion.marcas.filter((m) => m.estado === 'PENDIENTE').map((m) => String(m.studentId)),
  );

  const alumnos = estudiantes
    .map((e) => {
      const marca = aceptadaPorId.get(String(e._id));
      const estado = marca
        ? ('PRESENTE' as const)
        : pendientes.has(String(e._id))
          ? ('CONFIRMANDO' as const)
          : ('SIN_MARCA' as const);
      return {
        studentId: String(e._id),
        fullName: String(e.fullName ?? ''),
        code: String(e.code ?? ''),
        photoUrl: (e.photoUrl as string | null) ?? null,
        enlazado: conEnlace.has(String(e._id)),
        estado,
        marcadaEn: (marca?.confirmadaEn ?? marca?.creadaEn)?.toISOString() ?? null,
      };
    })
    .sort((a, b) => a.fullName.localeCompare(b.fullName, 'es'));

  const rechazos = sesion.marcas
    .filter((m) => m.estado === 'RECHAZADA')
    .map((m) => ({
      motivo: m.motivo as MotivoRechazo,
      mensaje: MENSAJE_DE_RECHAZO[m.motivo as MotivoRechazo] ?? 'Marca rechazada.',
      fullName: m.studentId ? (nombrePorId.get(String(m.studentId)) ?? null) : null,
      creadaEn: m.creadaEn.toISOString(),
    }))
    .reverse();

  const abierta = sesion.estado === 'ABIERTA';
  return {
    id: String(sesion._id),
    estado: sesion.estado,
    subjectId: String(sesion.subjectId),
    subjectName: String(materia?.name ?? ''),
    subjectCode: String(materia?.code ?? ''),
    grupo: sesion.visibles.grupo,
    hora: sesion.visibles.hora,
    period: sesion.period,
    date: sesion.date.toISOString(),
    abiertaEn: sesion.abiertaEn.toISOString(),
    cierraEn: sesion.cierraEn.toISOString(),
    cerradaEn: sesion.cerradaEn?.toISOString() ?? null,
    motivoCierre: sesion.motivoCierre,
    marcarAusentes: sesion.marcarAusentes,
    ausentesMarcados: sesion.ausentesMarcados,
    // Lo cuenta el servidor: el reloj del equipo del aula no tiene por qué ir
    // bien, y una cuenta atrás que miente hace cerrar la lista antes de tiempo.
    restanteMs: abierta ? Math.max(0, sesion.cierraEn.getTime() - Date.now()) : 0,
    resumen: {
      matriculados: sesion.matriculados.length,
      conUniPlanner: conEnlace.size,
      presentes: aceptadaPorId.size,
      confirmando: pendientes.size,
      rechazadas: rechazos.length,
    },
    alumnos,
    rechazos,
  };
}

/**
 * El contenido del QR ahora mismo, y cuándo pedir el siguiente.
 *
 * Lo compone el servidor: el secreto no sale de aquí, así que ningún cliente
 * podría calcularlo. `refrescarEnMs` es relativo para que la pantalla no dependa
 * de que su reloj coincida con este.
 */
export async function qrVigente(id: string, actor: Actor) {
  const sesion = exigirAcceso(await cargar(id, true), actor);
  const ahora = new Date();
  if (sesion.estado !== 'ABIERTA' || ahora > sesion.cierraEn) {
    throw new ErrorDeSesionQr(409, 'Esta lista ya no acepta marcas.');
  }

  const ventana = ventanaDe(ahora);
  return {
    contenido: componerQr({ sesionId: id, ventana, ...sesion.visibles }, String(sesion.secreto)),
    refrescarEnMs: finDeVentana(ventana).getTime() - ahora.getTime(),
    segundosPorVentana: SEGUNDOS_POR_VENTANA,
  };
}
