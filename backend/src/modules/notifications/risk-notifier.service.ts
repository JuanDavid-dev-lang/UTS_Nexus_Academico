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
import { computeAcademicRecords, type AcademicRecord } from '../../shared/academic.service.js';
import { emitToUser } from '../../shared/socket.js';

export type RiskScanOptions = {
  /** Limita el escaneo a un docente (para el disparo manual del profesor). */
  teacherId?: string;
  period?: string;
};

async function upsertRisk(userId: string, record: AcademicRecord) {
  const title = record.riesgo.nivel === 'ALTO' ? 'Riesgo académico ALTO' : 'Riesgo académico';
  const message =
    `${record.fullName || record.code}: ${record.riesgo.motivos.join(' ') || 'En seguimiento.'}`.trim();
  const query = {
    userId,
    type: 'RISK' as const,
    'metadata.studentId': record.studentId,
    'metadata.subjectId': record.subjectId,
    'metadata.period': record.period,
    readAt: null,
    deletedAt: null,
  };
  const item = await NotificationModel.findOneAndUpdate(
    query,
    {
      $set: {
        title,
        message,
        channel: 'IN_APP',
        metadata: {
          studentId: record.studentId,
          subjectId: record.subjectId,
          period: record.period,
          code: record.code,
          level: record.riesgo.nivel,
          riskScore: record.riesgo.puntaje,
          notaFinal: record.notaFinal,
          attendanceRate: record.riesgo.porcentajeAsistencia,
        },
      },
      $setOnInsert: { userId, type: 'RISK' },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  emitToUser(userId, 'sync:update', { entity: 'notification', action: 'risk', id: item.id });
  return item;
}

export async function generateRiskNotifications(options: RiskScanOptions = {}) {
  const records = await computeAcademicRecords({
    teacherId: options.teacherId,
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

  return { evaluados: records.length, enRiesgo: enRiesgo.length, notificaciones: creadasOActualizadas };
}
