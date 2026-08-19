/**
 * Escaneo de patrones de inasistencia: orquestación y acceso a datos.
 *
 * Aquí no se decide nada. Este servicio trae la asistencia agrupada, se la
 * pasa al dominio puro (`domains/attendance/patterns.ts`) y guarda lo que
 * responda. Los umbrales, las rachas y la severidad viven allí, donde se
 * pueden fijar con pruebas sin base de datos.
 */
import { Types } from 'mongoose';
import { AttendanceModel } from '../../models/attendance.model.js';
import { AttendanceCaseModel } from '../../models/attendance-case.model.js';
import { StudentModel } from '../../models/student.model.js';
import { SubjectModel } from '../../models/subject.model.js';
import { crearNotificacion } from '../../shared/notify.js';
import { emitToUser } from '../../shared/socket.js';
import { auditBatch } from '../../shared/audit.js';
import {
  claveDePatron,
  detectarPatrones,
  TITULO_PATRON,
  type ClaseAsistida,
  type Patron,
} from '../../domains/attendance/patterns.js';
import * as campo from '../../shared/validation.js';

export type ResultadoEscaneo = {
  seriesRevisadas: number;
  patronesDetectados: number;
  casosAbiertos: number;
  casosActualizados: number;
  casosResueltos: number;
  notificaciones: number;
};

/** Clases mínimas para que la serie signifique algo. Con una no hay patrón. */
const MINIMO_CLASES = 2;

type SerieAgrupada = {
  studentId: string;
  subjectId: string;
  groupId: string | null;
  teacherId: string | null;
  period: string;
  clases: ClaseAsistida[];
};

/**
 * Reúne la asistencia por (estudiante, materia, periodo).
 *
 * Agrupa Mongo y no Node: traer todos los documentos de asistencia de la
 * institución para agruparlos con un `Map` es exactamente lo que ya costó caro
 * en `academic.service.ts`. Viaja solo lo que el dominio necesita: fecha,
 * presencia, duración y retraso.
 */
async function reunirSeries(filtro: { period?: string; teacherId?: string }): Promise<SerieAgrupada[]> {
  const match: Record<string, unknown> = { deletedAt: null };
  if (filtro.period) match.period = filtro.period;
  if (filtro.teacherId && Types.ObjectId.isValid(filtro.teacherId)) {
    match.teacherId = new Types.ObjectId(filtro.teacherId);
  }

  const grupos = await AttendanceModel.aggregate<{
    _id: { studentId: unknown; subjectId: unknown; period: string };
    groupId: unknown;
    teacherId: unknown;
    clases: { date: Date; present: boolean; durationMinutes: number | null; lateMinutes: number | null }[];
  }>([
    { $match: match },
    { $sort: { date: 1 } },
    {
      $group: {
        _id: { studentId: '$studentId', subjectId: '$subjectId', period: '$period' },
        groupId: { $first: '$groupId' },
        teacherId: { $first: '$teacherId' },
        clases: {
          $push: {
            date: '$date',
            present: '$present',
            durationMinutes: '$durationMinutes',
            lateMinutes: '$lateMinutes',
          },
        },
      },
    },
  ]);

  return grupos.map(grupo => ({
    studentId: String(grupo._id.studentId),
    subjectId: String(grupo._id.subjectId),
    period: String(grupo._id.period ?? ''),
    groupId: grupo.groupId ? String(grupo.groupId) : null,
    teacherId: grupo.teacherId ? String(grupo.teacherId) : null,
    clases: grupo.clases,
  }));
}

/**
 * Escanea, abre o actualiza casos y avisa a quien corresponde.
 *
 * **No duplica casos.** La clave única del modelo es
 * (estudiante, materia, periodo, patrón), así que la segunda pasada que ve el
 * mismo problema actualiza `lastSeenAt` y `occurrences` en vez de escribir
 * otro caso. Y la clave de la notificación identifica el mismo hecho, así que
 * tampoco vuelve a sonar la campana.
 *
 * **La desaparición del patrón no borra nada.** El caso pasa a `RESUELTO` con
 * su fecha y sigue en el historial del estudiante: borrarlo dejaría al docente
 * sin memoria de lo que ya había atendido.
 */
export async function escanearPatronesDeAsistencia(
  filtro: { period?: string; teacherId?: string } = {},
): Promise<ResultadoEscaneo> {
  const series = (await reunirSeries(filtro)).filter(s => s.clases.length >= MINIMO_CLASES);

  const resultado: ResultadoEscaneo = {
    seriesRevisadas: series.length,
    patronesDetectados: 0,
    casosAbiertos: 0,
    casosActualizados: 0,
    casosResueltos: 0,
    notificaciones: 0,
  };
  if (series.length === 0) return resultado;

  // Nombres en dos consultas, no en dos por caso.
  const [estudiantes, materias] = await Promise.all([
    StudentModel.find({ _id: { $in: [...new Set(series.map(s => s.studentId))] } })
      .select('fullName code')
      .lean(),
    SubjectModel.find({ _id: { $in: [...new Set(series.map(s => s.subjectId))] } })
      .select('name')
      .lean(),
  ]);
  const nombreEstudiante = new Map(estudiantes.map(e => [String(e._id), String(e.fullName ?? '')]));
  const nombreMateria = new Map(materias.map(m => [String(m._id), String(m.name ?? '')]));

  const ahora = new Date();
  const auditoria: Parameters<typeof auditBatch>[0] = [];
  const vistos = new Map<string, Set<Patron>>();

  for (const serie of series) {
    const detecciones = detectarPatrones(serie.clases);
    resultado.patronesDetectados += detecciones.length;

    const claveSerie = `${serie.studentId}::${serie.subjectId}::${serie.period}`;
    vistos.set(claveSerie, new Set(detecciones.map(d => d.patron)));

    for (const deteccion of detecciones) {
      const filtroCaso = {
        studentId: serie.studentId,
        subjectId: serie.subjectId,
        period: serie.period,
        pattern: deteccion.patron,
      };

      const previo = await AttendanceCaseModel.findOne(filtroCaso).select('_id status').lean();

      const caso = await AttendanceCaseModel.findOneAndUpdate(
        filtroCaso,
        {
          $set: {
            groupId: serie.groupId,
            teacherId: serie.teacherId,
            severity: deteccion.severidad,
            evidence: deteccion.evidencia,
            evidenceData: deteccion.datos,
            lastSeenAt: ahora,
            deletedAt: null,
            // Un patrón que reaparece reabre el caso; no se queda "resuelto"
            // mientras el problema sigue ocurriendo.
            ...(previo?.status === 'RESUELTO' ? { status: 'ABIERTO', resolvedAt: null } : {}),
          },
          $inc: { occurrences: 1 },
          $setOnInsert: { detectedAt: ahora },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );

      if (previo) {
        resultado.casosActualizados += 1;
      } else {
        resultado.casosAbiertos += 1;
        auditoria.push({
          action: 'attendance.pattern.open',
          entity: 'CasoAsistencia',
          entityId: String(caso._id),
          after: { patron: deteccion.patron, severidad: deteccion.severidad },
        });
      }

      // Solo se avisa al abrir o al reabrir: una alerta que se repite en cada
      // pasada es la forma más rápida de enseñar a ignorar la campana.
      const esNuevo = !previo || previo.status === 'RESUELTO';
      if (esNuevo && serie.teacherId) {
        const alta = deteccion.severidad === 'ALTA';
        const notificacion = await crearNotificacion({
          userId: serie.teacherId,
          type: 'ATTENDANCE',
          priority: alta ? 'URGENT' : 'IMPORTANT',
          title: `${TITULO_PATRON[deteccion.patron]}: ${nombreEstudiante.get(serie.studentId) ?? 'estudiante'}`,
          message: `${nombreMateria.get(serie.subjectId) ?? 'Materia'} · ${deteccion.evidencia}`,
          dedupeKey: claveDePatron(serie.studentId, serie.subjectId, serie.period, deteccion.patron),
          link: `/estudiantes?buscar=${encodeURIComponent(nombreEstudiante.get(serie.studentId) ?? '')}`,
          metadata: {
            caseId: String(caso._id),
            studentId: serie.studentId,
            subjectId: serie.subjectId,
            pattern: deteccion.patron,
          },
        });
        if (notificacion.creada) resultado.notificaciones += 1;
      }

      if (serie.teacherId) {
        emitToUser(serie.teacherId, 'sync:update', {
          entity: 'attendanceCase',
          action: previo ? 'update' : 'create',
          id: String(caso._id),
        });
      }
    }
  }

  // ── Cierre de los que dejaron de ocurrir ────────────────────────────────
  const abiertos = await AttendanceCaseModel.find({
    status: { $in: ['ABIERTO', 'EN_SEGUIMIENTO'] },
    deletedAt: null,
    ...(filtro.period ? { period: filtro.period } : {}),
    ...(filtro.teacherId ? { teacherId: filtro.teacherId } : {}),
  })
    .select('_id studentId subjectId period pattern')
    .lean();

  const aResolver = abiertos.filter(caso => {
    const clave = `${String(caso.studentId)}::${String(caso.subjectId)}::${String(caso.period)}`;
    const activos = vistos.get(clave);
    // Sin serie en esta pasada no se resuelve nada: puede que el filtro no la
    // haya alcanzado, y cerrar un caso por no haberlo mirado es peor que
    // dejarlo abierto.
    return activos ? !activos.has(caso.pattern as Patron) : false;
  });

  if (aResolver.length > 0) {
    await AttendanceCaseModel.updateMany(
      { _id: { $in: aResolver.map(c => c._id) } },
      { $set: { status: 'RESUELTO', resolvedAt: ahora } },
    );
    resultado.casosResueltos = aResolver.length;
  }

  // Una sola escritura de auditoría para todo el lote: agrupar solo el upsert
  // dejaría el bucle donde estaba.
  await auditBatch(auditoria);

  return resultado;
}

// ── Consulta de casos ────────────────────────────────────────────────────────

export type FiltroCasos = {
  studentId?: string;
  subjectId?: string;
  period?: string;
  status?: string;
  /** Lo impone el rol; nunca llega del cliente. */
  teacherId?: string;
};

export async function listarCasos(filtro: FiltroCasos, pagina: campo.Paginacion) {
  const query: Record<string, unknown> = { deletedAt: null };
  if (filtro.studentId) query.studentId = filtro.studentId;
  if (filtro.subjectId) query.subjectId = filtro.subjectId;
  if (filtro.period) query.period = filtro.period;
  if (filtro.status) query.status = filtro.status;
  // El rol va al final: manda sobre lo que pida la URL.
  if (filtro.teacherId) query.teacherId = filtro.teacherId;

  const { skip, limit } = campo.saltoYTope(pagina);
  const [items, total] = await Promise.all([
    AttendanceCaseModel.find(query).sort({ severity: -1, detectedAt: -1 }).skip(skip).limit(limit).lean(),
    AttendanceCaseModel.countDocuments(query),
  ]);
  return { items, total };
}

/** Registra la intervención del docente sobre un caso. */
export async function registrarIntervencion(
  id: string,
  entrada: { nota: string; estado: 'EN_SEGUIMIENTO' | 'RESUELTO' | 'DESCARTADO' },
  usuario: { id: string; role: string },
) {
  const query: Record<string, unknown> = { _id: id, deletedAt: null };
  if (usuario.role === 'PROFESSOR') query.teacherId = usuario.id;

  const caso = await AttendanceCaseModel.findOneAndUpdate(
    query,
    {
      $set: {
        status: entrada.estado,
        interventionNote: entrada.nota,
        interventionAt: new Date(),
        interventionBy: usuario.id,
        ...(entrada.estado === 'RESUELTO' ? { resolvedAt: new Date() } : {}),
      },
    },
    { new: true },
  );
  if (!caso) {
    const error = new Error('Not found') as Error & { statusCode: number };
    error.statusCode = 404;
    throw error;
  }

  await auditBatch([
    {
      actorId: usuario.id,
      action: 'attendance.pattern.intervene',
      entity: 'CasoAsistencia',
      entityId: String(caso._id),
      after: { estado: entrada.estado },
    },
  ]);
  if (caso.teacherId) {
    emitToUser(String(caso.teacherId), 'sync:update', {
      entity: 'attendanceCase',
      action: 'update',
      id: String(caso._id),
    });
  }
  return caso.toObject();
}
