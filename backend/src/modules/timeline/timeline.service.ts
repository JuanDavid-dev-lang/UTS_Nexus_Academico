/**
 * Historial cronológico de un estudiante.
 *
 * La unión y el orden los hace el backend, y eso no es una preferencia de
 * arquitectura: el historial cruza seis colecciones, y si cada cliente lo
 * armara por su cuenta harían seis peticiones, ordenarían con seis criterios y
 * el escritorio y el móvil mostrarían dos historias distintas del mismo
 * estudiante. Aquí sale una sola lista ya ordenada.
 *
 * Se distingue el HECHO ACADÉMICO del evento técnico. Una nota corregida es
 * historial del estudiante; que alguien tocara un documento a las 3:14 es
 * auditoría, y vive en su propio panel. Mezclarlos convertiría la ficha en un
 * volcado de registros que nadie lee.
 */
import { Types } from 'mongoose';
import { EnrollmentModel } from '../../models/enrollment.model.js';
import { GradeModel } from '../../models/grade.model.js';
import { AttendanceModel } from '../../models/attendance.model.js';
import { AttendanceCaseModel } from '../../models/attendance-case.model.js';
import { RiskFeedbackModel } from '../../models/risk-feedback.model.js';
import { ActivityModel } from '../../models/activity.model.js';
import { AcademicSnapshotModel } from '../../models/academic-snapshot.model.js';
import { SubjectModel } from '../../models/subject.model.js';
import { StudentModel } from '../../models/student.model.js';
import { computeAcademicRecords } from '../../shared/academic.service.js';
import { TITULO_PATRON, type Patron } from '../../domains/attendance/patterns.js';
import * as campo from '../../shared/validation.js';

export type TipoEvento =
  | 'MATRICULA'
  | 'NOTA'
  | 'ASISTENCIA'
  | 'ALERTA_RIESGO'
  | 'INTERVENCION'
  | 'PATRON_ASISTENCIA'
  | 'ACTIVIDAD'
  | 'CIERRE_PERIODO';

/** Contrato de un evento del historial. Igual para los dos clientes. */
export type EventoHistorial = {
  id: string;
  type: TipoEvento;
  occurredAt: string;
  title: string;
  summary: string;
  period: string;
  subjectId: string | null;
  subjectName: string | null;
  /** Mínima y segura: cifras y estados, nunca notas internas del docente. */
  metadata: Record<string, unknown>;
  /** Documento de origen, para poder abrirlo. */
  sourceId: string;
  /** Ruta interna a la que lleva, cuando la hay. */
  link: string | null;
};

export type FiltroHistorial = {
  studentId: string;
  period?: string;
  subjectId?: string;
  tipos?: TipoEvento[];
  desde?: Date;
  hasta?: Date;
};

export type Solicitante = { id: string; role: string; studentId?: string };

type ParDeAlcance = { subjectId: string; period: string };
type AlcanceEfectivo = ParDeAlcance[] | null;

/** Error de negocio con código HTTP. */
class ErrorDeHistorial extends Error {
  constructor(
    message: string,
    public statusCode: number,
  ) {
    super(message);
  }
}

/**
 * ¿Puede este usuario ver el historial de este estudiante?
 *
 * Un estudiante solo el suyo, y se compara contra la ficha vinculada a la
 * sesión, no contra un id del cuerpo. Un docente, solo los de su alcance, con
 * `professorOwnsStudent()` — el mismo comprobante que usa `GET /students/:id`,
 * porque filtrar solo el listado deja la ficha accesible a quien copie un id.
 */
export async function exigirAcceso(studentId: string, usuario: Solicitante, subjectId?: string): Promise<void> {
  if (usuario.role === 'ADMIN' || usuario.role === 'COORDINATOR') return;

  if (usuario.role === 'STUDENT') {
    if (!usuario.studentId || usuario.studentId !== studentId) {
      throw new ErrorDeHistorial('Forbidden', 403);
    }
    return;
  }

  const pertenece = await EnrollmentModel.exists({
    studentId, professorId: usuario.id, enrollmentStatus: 'ACTIVE', deletedAt: null,
    ...(subjectId ? { subjectId } : {}),
  });
  if (!pertenece) throw new ErrorDeHistorial('Forbidden', 403);
}

async function resolverAlcanceEfectivo(
  filtro: FiltroHistorial,
  usuario: Solicitante,
): Promise<AlcanceEfectivo> {
  await exigirAcceso(filtro.studentId, usuario, filtro.subjectId);
  if (usuario.role !== 'PROFESSOR') return null;

  const matriculas = await EnrollmentModel.find({
    studentId: filtro.studentId,
    professorId: usuario.id,
    enrollmentStatus: 'ACTIVE',
    deletedAt: null,
    ...(filtro.subjectId ? { subjectId: filtro.subjectId } : {}),
    ...(filtro.period ? { period: filtro.period } : {}),
  }).select('subjectId period').lean();

  const pares = [...new Map(matriculas.map(m => {
    const par = { subjectId: String(m.subjectId), period: String(m.period) };
    return [`${par.subjectId}|${par.period}`, par] as const;
  })).values()];
  if (pares.length === 0) throw new ErrorDeHistorial('Forbidden', 403);
  return pares;
}

/** Filtro Mongo que conserva la pareja materia-periodo; no crea un producto cruzado. */
export function condicionDeAlcance(pares: ParDeAlcance[]): Record<string, unknown> {
  return {
    $or: pares.map(par => ({
      subjectId: new Types.ObjectId(par.subjectId),
      period: par.period,
    })),
  };
}

/** Nombres de materia en una sola consulta: el N+1 aquí serían decenas de viajes. */
async function nombresDeMateria(ids: (string | null)[]): Promise<Map<string, string>> {
  const limpios = [...new Set(ids.filter(Boolean).map(String))].filter(id =>
    Types.ObjectId.isValid(id),
  );
  if (limpios.length === 0) return new Map();
  const materias = await SubjectModel.find({ _id: { $in: limpios } })
    .select('name code')
    .lean();
  return new Map(materias.map(m => [String(m._id), String(m.name ?? m.code ?? '')]));
}

function rangoDeFechas(filtro: FiltroHistorial, campoFecha: string): Record<string, unknown> {
  if (!filtro.desde && !filtro.hasta) return {};
  return {
    [campoFecha]: {
      ...(filtro.desde ? { $gte: filtro.desde } : {}),
      ...(filtro.hasta ? { $lte: filtro.hasta } : {}),
    },
  };
}

/**
 * Construye la línea de tiempo.
 *
 * Cada fuente se consulta una vez, acotada al estudiante y con tope propio: el
 * historial de asistencia de un semestre son decenas de registros por materia,
 * y traerlos todos para mostrar veinte sería trabajo que nadie ve. Las seis
 * consultas van en paralelo.
 *
 * La paginación se aplica **después de ordenar la unión**, no dentro de cada
 * fuente: paginar por fuente devolvería las veinte notas más recientes y
 * ninguna asistencia, aunque la asistencia fuera más nueva.
 */
export async function construirHistorial(
  filtro: FiltroHistorial,
  pagina: campo.Paginacion,
  usuario: Solicitante,
  alcanceYaResuelto?: { valor: AlcanceEfectivo },
): Promise<{ items: EventoHistorial[]; total: number }> {
  if (!Types.ObjectId.isValid(filtro.studentId) ||
      (filtro.subjectId && !Types.ObjectId.isValid(filtro.subjectId))) {
    throw new ErrorDeHistorial('Not found', 404);
  }
  const alcance = alcanceYaResuelto?.valor ?? await resolverAlcanceEfectivo(filtro, usuario);
  const studentId = new Types.ObjectId(filtro.studentId);

  const base: Record<string, unknown> = { studentId, deletedAt: null };
  if (alcance) Object.assign(base, condicionDeAlcance(alcance));
  else {
    if (filtro.period) base.period = filtro.period;
    if (filtro.subjectId) base.subjectId = new Types.ObjectId(filtro.subjectId);
  }

  // Tope por fuente. Generoso, pero acotado: un semestre completo cabe de
  // sobra y una consulta sin techo no cabe en la memoria de nadie.
  const TOPE = 400;

  const [matriculas, notas, asistencia, casos, alertas, fotografias] = await Promise.all([
    EnrollmentModel.find(base).sort({ createdAt: -1 }).limit(TOPE).lean(),
    GradeModel.find({ ...base, ...rangoDeFechas(filtro, 'updatedAt') })
      .sort({ updatedAt: -1 })
      .limit(TOPE)
      .lean(),
    // Solo lo que cuenta una historia: las ausencias y las llegadas tarde. Una
    // asistencia normal repetida cuarenta veces no es historial, es ruido.
    AttendanceModel.find({
      $and: [
        { ...base, ...rangoDeFechas(filtro, 'date') },
        { $or: [{ present: false }, { lateMinutes: { $gt: 0 } }] },
      ],
    })
      .sort({ date: -1 })
      .limit(TOPE)
      .lean(),
    AttendanceCaseModel.find(base)
      .sort({ detectedAt: -1 })
      .limit(TOPE)
      .lean(),
    RiskFeedbackModel.find(base)
      .sort({ createdAt: -1 })
      .limit(TOPE)
      .lean(),
    AcademicSnapshotModel.find(base)
      .sort({ capturedAt: -1 })
      .limit(TOPE)
      .lean(),
  ]);

  // Las actividades no cuelgan del estudiante sino de su materia: se buscan
  // por las materias en las que está matriculado, no por él.
  const materiasMatriculadas = [...new Set(matriculas.map(m => String(m.subjectId)))];
  const actividades = materiasMatriculadas.length
    ? await ActivityModel.find({
        deletedAt: null,
        ...(alcance
          ? condicionDeAlcance(alcance)
          : {
              subjectId: { $in: materiasMatriculadas },
              ...(filtro.period ? { period: filtro.period } : {}),
            }),
        ...rangoDeFechas(filtro, 'dueAt'),
      })
        .sort({ dueAt: -1 })
        .limit(TOPE)
        .lean()
    : [];

  const nombres = await nombresDeMateria([
    ...matriculas.map(m => String(m.subjectId)),
    ...notas.map(n => String(n.subjectId)),
    ...asistencia.map(a => String(a.subjectId)),
    ...casos.map(c => String(c.subjectId)),
    ...alertas.map(a => String(a.subjectId)),
    ...actividades.map(a => String(a.subjectId)),
    ...fotografias.map(f => String(f.subjectId)),
  ]);

  const eventos: EventoHistorial[] = [];
  const nombreDe = (id: unknown) => nombres.get(String(id)) ?? null;

  for (const matricula of matriculas) {
    eventos.push({
      id: `enrollment:${matricula._id}`,
      type: 'MATRICULA',
      occurredAt: iso(matricula.createdAt),
      title: matricula.enrollmentStatus === 'WITHDRAWN' ? 'Retiro de matrícula' : 'Matrícula',
      summary: `${nombreDe(matricula.subjectId) ?? 'Materia'} · periodo ${matricula.period}.`,
      period: String(matricula.period ?? ''),
      subjectId: String(matricula.subjectId),
      subjectName: nombreDe(matricula.subjectId),
      metadata: { estado: matricula.enrollmentStatus },
      sourceId: String(matricula._id),
      link: `/materias?subjectId=${matricula.subjectId}`,
    });
  }

  for (const nota of notas) {
    // `createdAt === updatedAt` significa que nunca se tocó: es un alta.
    const modificada = iso(nota.createdAt) !== iso(nota.updatedAt);
    eventos.push({
      id: `grade:${nota._id}`,
      type: 'NOTA',
      occurredAt: iso(nota.updatedAt ?? nota.createdAt),
      title: modificada ? 'Nota modificada' : 'Nota registrada',
      summary: `${nombreDe(nota.subjectId) ?? 'Materia'} · corte ${nota.corte} · ${nota.label ?? 'Nota'}: ${Number(nota.score ?? 0).toFixed(1)}.`,
      period: String(nota.period ?? ''),
      subjectId: String(nota.subjectId),
      subjectName: nombreDe(nota.subjectId),
      metadata: {
        corte: nota.corte,
        componente: nota.componentType,
        nota: Number(nota.score ?? 0),
      },
      sourceId: String(nota._id),
      link: `/notas?subjectId=${nota.subjectId}&period=${nota.period}`,
    });
  }

  for (const clase of asistencia) {
    const tarde = Number(clase.lateMinutes ?? 0);
    eventos.push({
      id: `attendance:${clase._id}`,
      type: 'ASISTENCIA',
      occurredAt: iso(clase.date),
      title: clase.present ? 'Llegada tarde' : 'Ausencia',
      summary: clase.present
        ? `${nombreDe(clase.subjectId) ?? 'Materia'} · ${tarde} min de retraso.`
        : `${nombreDe(clase.subjectId) ?? 'Materia'} · no asistió.`,
      period: String(clase.period ?? ''),
      subjectId: String(clase.subjectId),
      subjectName: nombreDe(clase.subjectId),
      metadata: { presente: clase.present, minutosTarde: tarde },
      sourceId: String(clase._id),
      link: `/asistencia?subjectId=${clase.subjectId}`,
    });
  }

  for (const caso of casos) {
    eventos.push({
      id: `pattern:${caso._id}`,
      type: 'PATRON_ASISTENCIA',
      occurredAt: iso(caso.detectedAt ?? caso.createdAt),
      title: TITULO_PATRON[caso.pattern as Patron] ?? 'Patrón de inasistencia',
      summary: String(caso.evidence ?? ''),
      period: String(caso.period ?? ''),
      subjectId: String(caso.subjectId),
      subjectName: nombreDe(caso.subjectId),
      metadata: {
        patron: caso.pattern,
        severidad: caso.severity,
        estado: caso.status,
        // La nota de intervención es del docente y puede contener juicios
        // personales; el estudiante ve que hubo seguimiento, no qué se escribió.
        ...(usuario.role === 'STUDENT' ? {} : { intervencion: caso.interventionNote ?? '' }),
      },
      sourceId: String(caso._id),
      link: `/asistencia?caso=${caso._id}`,
    });
  }

  for (const alerta of alertas) {
    const conIntervencion = Boolean(alerta.interventionAt);
    eventos.push({
      id: `risk:${alerta._id}`,
      type: conIntervencion ? 'INTERVENCION' : 'ALERTA_RIESGO',
      occurredAt: iso(alerta.interventionAt ?? alerta.createdAt),
      title: conIntervencion ? 'Intervención registrada' : 'Alerta de riesgo académico',
      summary: `${nombreDe(alerta.subjectId) ?? 'Materia'} · ${alerta.interventionStatus ?? 'PENDIENTE'}.`,
      period: String(alerta.period ?? ''),
      subjectId: alerta.subjectId ? String(alerta.subjectId) : null,
      subjectName: nombreDe(alerta.subjectId),
      metadata: {
        estado: alerta.interventionStatus ?? 'PENDIENTE',
        ...(usuario.role === 'STUDENT' ? {} : { nota: alerta.interventionNote ?? '' }),
      },
      sourceId: String(alerta._id),
      link: `/riesgo?studentId=${filtro.studentId}`,
    });
  }

  for (const actividad of actividades) {
    eventos.push({
      id: `activity:${actividad._id}`,
      type: 'ACTIVIDAD',
      occurredAt: iso(actividad.dueAt),
      title: String(actividad.title ?? 'Actividad'),
      summary: `${nombreDe(actividad.subjectId) ?? 'Materia'} · vence ${iso(actividad.dueAt).slice(0, 10)}.`,
      period: String(actividad.period ?? ''),
      subjectId: String(actividad.subjectId),
      subjectName: nombreDe(actividad.subjectId),
      metadata: { estado: actividad.status, peso: actividad.weight ?? 0 },
      sourceId: String(actividad._id),
      link: `/actividades?item=${actividad._id}`,
    });
  }

  for (const foto of fotografias) {
    eventos.push({
      id: `snapshot:${foto._id}`,
      type: 'CIERRE_PERIODO',
      occurredAt: iso(foto.capturedAt),
      title: `Cierre del periodo ${foto.period}`,
      summary: `${nombreDe(foto.subjectId) ?? 'Materia'} · nota final ${Number(foto.notaFinal ?? 0).toFixed(2)} · ${foto.aprobado ? 'aprobado' : 'reprobado'}.`,
      period: String(foto.period ?? ''),
      subjectId: String(foto.subjectId),
      subjectName: nombreDe(foto.subjectId),
      metadata: {
        notaFinal: Number(foto.notaFinal ?? 0),
        aprobado: Boolean(foto.aprobado),
        asistencia: Number(foto.asistenciaPorcentaje ?? 0),
        riesgo: foto.riesgoNivel,
      },
      sourceId: String(foto._id),
      link: `/periodos?period=${foto.period}`,
    });
  }

  const filtrados = filtro.tipos?.length
    ? eventos.filter(evento => filtro.tipos!.includes(evento.type))
    : eventos;

  // El orden es estable: a igualdad de instante, el id desempata. Sin eso, dos
  // eventos del mismo segundo podrían intercambiarse entre página y página y
  // uno de los dos no aparecería nunca.
  filtrados.sort((a, b) => {
    const diferencia = b.occurredAt.localeCompare(a.occurredAt);
    return diferencia !== 0 ? diferencia : a.id.localeCompare(b.id);
  });

  const { skip, limit } = campo.saltoYTope(pagina);
  return { items: filtrados.slice(skip, skip + limit), total: filtrados.length };
}

export type ExpedienteSeguimiento = {
  student: { id: string; code: string; fullName: string; email: string | null; program: string };
  context: { subjectId: string | null; subjectName: string | null; period: string | null };
  academic: Array<{
    subjectId: string; subjectName: string | null; period: string; finalGrade: number;
    currentGrade: number; cuts: number[]; complete: boolean; attendancePercentage: number;
    absences: number; risk: { level: string; score: number; reasons: string[] };
  }>;
  followUp: { open: unknown | null; episodes: unknown[]; progress: string | null };
  timeline: { items: EventoHistorial[]; total: number; page: number; limit: number; hasMore: boolean };
  allowedActions: string[];
};

export function presentarEpisodiosSeguimiento(casos: any[], esEstudiante: boolean) {
  return casos.flatMap(c => (c.seguimientos ?? []).map((e: any) => ({
    id: String(e._id), action: e.accion, status: e.estado, createdAt: iso(e.creadoEn),
    closedAt: e.cerradoEn ? iso(e.cerradoEn) : null,
    initialRisk: e.nivelAlCrear, closingRisk: e.nivelAlCerrar ?? null,
    ...(esEstudiante ? {} : { note: e.nota ?? '', closingNote: e.notaCierre ?? '' }),
  }))).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Lectura integrada: compone fuentes existentes sin recalcular reglas académicas. */
export async function construirExpedienteSeguimiento(
  filtro: FiltroHistorial,
  pagina: campo.Paginacion,
  usuario: Solicitante,
): Promise<ExpedienteSeguimiento> {
  if (!Types.ObjectId.isValid(filtro.studentId) ||
      (filtro.subjectId && !Types.ObjectId.isValid(filtro.subjectId))) {
    throw new ErrorDeHistorial('Not found', 404);
  }
  const alcance = await resolverAlcanceEfectivo(filtro, usuario);

  const estudiante = await StudentModel.findOne({ _id: filtro.studentId, deletedAt: null })
    .select('code fullName email program').lean();
  if (!estudiante) throw new ErrorDeHistorial('Not found', 404);

  const consultasAcademicas = alcance
    ? alcance.map(par => computeAcademicRecords({
        studentId: filtro.studentId,
        subjectId: par.subjectId,
        period: par.period,
      }))
    : [computeAcademicRecords({
        studentId: filtro.studentId,
        subjectId: filtro.subjectId,
        period: filtro.period,
      })];
  const [lotesAcademicos, historial, casos] = await Promise.all([
    Promise.all(consultasAcademicas),
    construirHistorial(filtro, pagina, usuario, { valor: alcance }),
    RiskFeedbackModel.find({
      studentId: filtro.studentId,
      deletedAt: null,
      ...(alcance
        ? condicionDeAlcance(alcance)
        : {
            ...(filtro.subjectId ? { subjectId: filtro.subjectId } : {}),
            ...(filtro.period ? { period: filtro.period } : {}),
          }),
    }).sort({ updatedAt: -1 }).lean(),
  ]);
  const registros = lotesAcademicos.flat();
  const nombres = await nombresDeMateria([
    filtro.subjectId ?? null,
    ...registros.map(r => r.subjectId),
  ]);
  const episodios = presentarEpisodiosSeguimiento(casos, usuario.role === 'STUDENT');
  const abierto = episodios.find(e => e.status === 'EN_CURSO') ?? null;
  const progreso = abierto ? null : episodios[0]?.closingRisk && episodios[0]?.initialRisk
    ? `${episodios[0].initialRisk}->${episodios[0].closingRisk}` : null;

  return {
    student: { id: String(estudiante._id), code: String(estudiante.code ?? ''), fullName: String(estudiante.fullName ?? ''), email: estudiante.email ? String(estudiante.email) : null, program: String(estudiante.program ?? '') },
    context: { subjectId: filtro.subjectId ?? null, subjectName: filtro.subjectId ? nombres.get(filtro.subjectId) ?? null : null, period: filtro.period ?? null },
    academic: registros.map(r => ({
      subjectId: r.subjectId, subjectName: nombres.get(r.subjectId) ?? null, period: r.period,
      finalGrade: r.notaFinal, currentGrade: r.riesgo.notaActual, cuts: r.cortes,
      complete: r.notaCompleta, attendancePercentage: r.riesgo.porcentajeAsistencia,
      absences: r.riesgo.clasesAusente,
      risk: { level: r.riesgo.nivel, score: r.riesgo.puntaje, reasons: r.riesgo.motivos },
    })),
    followUp: { open: abierto, episodes: episodios, progress: progreso },
    timeline: { ...historial, page: pagina.page, limit: pagina.limit, hasMore: pagina.page * pagina.limit < historial.total },
    allowedActions: usuario.role === 'STUDENT' ? [] : ['OPEN_FOLLOW_UP', 'UPDATE_FOLLOW_UP'],
  };
}

function iso(valor: unknown): string {
  const instante = new Date((valor as string) ?? 0);
  return Number.isNaN(instante.getTime()) ? new Date(0).toISOString() : instante.toISOString();
}
