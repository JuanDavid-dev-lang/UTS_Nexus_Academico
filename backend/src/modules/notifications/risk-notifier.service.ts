/**
 * Generador de notificaciones de riesgo académico.
 *
 * Recorre los registros académicos (motor de dominio), y para cada estudiante en
 * riesgo MEDIO/ALTO crea/actualiza una notificación tipo RISK para el docente y
 * para el propio estudiante. Es idempotente: mientras la alerta siga sin leerse
 * se actualiza en lugar de duplicarse (dedupe por estudiante+materia+periodo).
 */
import { NotificationModel } from '../../models/notification.model.js';
import { UserModel } from '../../models/user.model.js';
import { SubjectModel } from '../../models/subject.model.js';
import {
  claveAlertaCorte,
  cortesEnAlerta,
  mensajeAlertaCorte,
} from '../../domains/risk/alerta-corte.js';
import { computeAcademicRecords, type AcademicRecord } from '../../shared/academic.service.js';
import { emitToUser } from '../../shared/socket.js';
import { crearNotificacion } from '../../shared/notify.js';

export type RiskScanOptions = {
  /** Limita el escaneo a un docente (para el disparo manual del profesor). */
  teacherId?: string;
  /** Limita a unas materias (el disparo manual de coordinación). */
  subjectIds?: string[];
  period?: string;
};

async function upsertRisk(userId: string, record: AcademicRecord) {
  const title = record.riesgo.nivel === 'ALTO' ? 'Riesgo académico ALTO' : 'Riesgo académico';
  const message =
    `${record.fullName || record.code}: ${record.riesgo.motivos.join(' ') || 'En seguimiento.'}`.trim();
  const metadata = {
    studentId: record.studentId,
    subjectId: record.subjectId,
    period: record.period,
    code: record.code,
    level: record.riesgo.nivel,
    riskScore: record.riesgo.puntaje,
    notaFinal: record.notaFinal,
    attendanceRate: record.riesgo.porcentajeAsistencia,
  };
  const priority = record.riesgo.nivel === 'ALTO' ? ('URGENT' as const) : ('IMPORTANT' as const);
  // Al tocarla se abre la ficha del estudiante por su cédula, que es el
  // identificador con el que el docente lo reconoce.
  const link = `/estudiantes?buscar=${encodeURIComponent(record.code)}`;

  // Mientras la alerta siga sin leer se reescribe: es el mismo caso, con los
  // motivos actualizados, y no debe volver a sonar en el teléfono.
  const pendiente = await NotificationModel.findOneAndUpdate(
    {
      userId,
      type: 'RISK' as const,
      'metadata.studentId': record.studentId,
      'metadata.subjectId': record.subjectId,
      'metadata.period': record.period,
      readAt: null,
      deletedAt: null,
    },
    { $set: { title, message, priority, link, metadata } },
    { new: true },
  );

  if (pendiente) {
    emitToUser(userId, 'sync:update', { entity: 'notification', action: 'risk', id: pendiente.id });
    return pendiente;
  }

  // Sin alerta pendiente se crea una nueva —y esa sí avisa al teléfono—, aunque
  // exista una anterior ya leída: que el docente diera por vista la de la
  // semana pasada no significa que sepa que el caso sigue abierto.
  const creada = await crearNotificacion({
    userId,
    title,
    message,
    type: 'RISK',
    priority,
    link,
    metadata,
  });
  return creada;
}

export async function generateRiskNotifications(options: RiskScanOptions = {}) {
  // Una lista vacía es «nada en tu alcance», no «sin filtro».
  if (options.subjectIds && options.subjectIds.length === 0) {
    return { evaluados: 0, enRiesgo: 0, notificaciones: 0 };
  }
  const records = await computeAcademicRecords({
    teacherId: options.teacherId,
    subjectIds: options.subjectIds,
    period: options.period,
  });

  const enRiesgo = records.filter(r => r.riesgo.nivel !== 'BAJO');

  // Mapa estudiante → usuario (para avisar también al alumno).
  const studentIds = [...new Set(enRiesgo.map(r => r.studentId))];
  const studentUsers = await UserModel.find({ studentId: { $in: studentIds }, deletedAt: null })
    .select('_id studentId')
    .lean();
  const userByStudent = new Map(studentUsers.map(u => [String(u.studentId), String(u._id)]));

  let creadasOActualizadas = 0;
  for (const record of enRiesgo) {
    // 1) Notificar al docente responsable de la nota/materia.
    if (record.teacherId) {
      await upsertRisk(record.teacherId, record);
      creadasOActualizadas += 1;
    }
    // 2) Notificar al estudiante (self-service en Android), si tiene login.
    const studentUserId = userByStudent.get(record.studentId);
    if (studentUserId) {
      await upsertRisk(studentUserId, record);
      creadasOActualizadas += 1;
    }
  }

  const alertasCorte = await avisarCortesBajos(records);

  return {
    evaluados: records.length,
    enRiesgo: enRiesgo.length,
    notificaciones: creadasOActualizadas,
    alertasCorte,
  };
}

/**
 * Alerta temprana: un corte completo por debajo de 3.0 avisa al docente una
 * vez (`dedupeKey` por estudiante, materia, periodo y corte) y lo lleva al
 * seguimiento del caso. Va aunque el riesgo esté en BAJO: un buen segundo corte
 * tapa en el promedio el primero que merecía una tutoría.
 *
 * Reusa los registros del escaneo de riesgo: una segunda agregación sería el
 * mismo trabajo dos veces por pasada.
 */
async function avisarCortesBajos(records: AcademicRecord[]): Promise<number> {
  // Solo el semestre más reciente: el escaneo automático no filtra periodo, y
  // sin esto el primer despliegue avisaría de cada corte perdido en semestres
  // ya cerrados, cuando una tutoría ya no cambia nada.
  const actual = records.reduce((max, r) => (r.period > max ? r.period : max), '');
  const conAlerta = records
    .filter(r => r.teacherId && r.period === actual)
    .map(r => ({ record: r, alertas: cortesEnAlerta(r.cortes, r.cortesCompletos) }))
    .filter(x => x.alertas.length > 0);
  if (conAlerta.length === 0) return 0;

  const materias = await SubjectModel.find({ _id: { $in: [...new Set(conAlerta.map(x => x.record.subjectId))] } })
    .select('name')
    .lean();
  const nombreMateria = new Map(materias.map(m => [String(m._id), String(m.name ?? 'la materia')]));

  let creadas = 0;
  for (const { record, alertas } of conAlerta) {
    const nombre = record.fullName || record.code || 'Un estudiante';
    for (const alerta of alertas) {
      const resultado = await crearNotificacion({
        userId: String(record.teacherId),
        title: `Corte ${alerta.corte} por debajo de 3.0`,
        message: mensajeAlertaCorte(nombre, nombreMateria.get(record.subjectId) ?? 'la materia', alerta),
        type: 'RISK',
        priority: 'IMPORTANT',
        dedupeKey: claveAlertaCorte(record.studentId, record.subjectId, record.period, alerta.corte),
        link: `/riesgo?buscar=${encodeURIComponent(record.code)}`,
        metadata: {
          studentId: record.studentId,
          subjectId: record.subjectId,
          period: record.period,
          code: record.code,
          corte: alerta.corte,
          notaCorte: alerta.nota,
          sugerencia: 'TUTORIA',
        },
      });
      if (resultado.creada) creadas += 1;
    }
  }
  return creadas;
}
