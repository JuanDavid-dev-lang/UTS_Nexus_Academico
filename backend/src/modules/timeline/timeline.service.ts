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
import { professorOwnsStudent } from '../../shared/professor-scope.js';
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
  tipos?: TipoEvento[];
  desde?: Date;
  hasta?: Date;
};

export type Solicitante = { id: string; role: string; studentId?: string };

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
async function exigirAcceso(studentId: string, usuario: Solicitante): Promise<void> {
  if (usuario.role === 'ADMIN' || usuario.role === 'COORDINATOR') return;

  if (usuario.role === 'STUDENT') {
    if (!usuario.studentId || usuario.studentId !== studentId) {
      throw new ErrorDeHistorial('Forbidden', 403);
    }
    return;
  }

  if (!(await professorOwnsStudent(usuario.id, studentId))) {
    throw new ErrorDeHistorial('Forbidden', 403);
  }
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
): Promise<{ items: EventoHistorial[]; total: number }> {
  await exigirAcceso(filtro.studentId, usuario);

  if (!Types.ObjectId.isValid(filtro.studentId)) {
    throw new ErrorDeHistorial('Not found', 404);
  }
  const studentId = new Types.ObjectId(filtro.studentId);

  const base: Record<string, unknown> = { studentId, deletedAt: null };
  if (filtro.period) base.period = filtro.period;

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
      ...base,
      ...rangoDeFechas(filtro, 'date'),
      $or: [{ present: false }, { lateMinutes: { $gt: 0 } }],
    })
      .sort({ date: -1 })
      .limit(TOPE)
      .lean(),
    AttendanceCaseModel.find({ studentId, deletedAt: null, ...(filtro.period ? { period: filtro.period } : {}) })
      .sort({ detectedAt: -1 })
      .limit(TOPE)
      .lean(),
    RiskFeedbackModel.find({ studentId, ...(filtro.period ? { period: filtro.period } : {}) })
      .sort({ createdAt: -1 })
      .limit(TOPE)
      .lean(),
    AcademicSnapshotModel.find({ studentId, ...(filtro.period ? { period: filtro.period } : {}) })
      .sort({ capturedAt: -1 })
      .limit(TOPE)
      .lean(),
  ]);

  // Las actividades no cuelgan del estudiante sino de su materia: se buscan
  // por las materias en las que está matriculado, no por él.
  const materiasMatriculadas = [...new Set(matriculas.map(m => String(m.subjectId)))];
  const actividades = materiasMatriculadas.length
    ? await ActivityModel.find({
        subjectId: { $in: materiasMatriculadas },
        deletedAt: null,
        ...(filtro.period ? { period: filtro.period } : {}),
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

function iso(valor: unknown): string {
  const instante = new Date((valor as string) ?? 0);
  return Number.isNaN(instante.getTime()) ? new Date(0).toISOString() : instante.toISOString();
}
