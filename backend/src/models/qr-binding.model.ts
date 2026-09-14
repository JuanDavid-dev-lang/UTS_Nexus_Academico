import { Schema, model } from 'mongoose';

/**
 * Qué cuenta de UniPlanner marcó asistencia por qué estudiante en un semestre.
 *
 * Es el bloqueo del enlace visto desde Nexus. `lockedUntil` en Firestore impide
 * cambiar el documento del enlace, pero lo hacen valer las reglas de otra
 * aplicación, y borrar el perfil y volver a crearlo dejaba la cuenta libre de
 * enlazarse al código de un compañero y marcar por él. Esto no depende de
 * Firestore: la primera asistencia confirmada ata la cuenta al estudiante (y el
 * estudiante a la cuenta) hasta que acaba el periodo o la institución lo
 * libera desde «Vínculos UniPlanner».
 *
 * Los dos índices únicos son la garantía: una cuenta por estudiante y un
 * estudiante por cuenta en cada periodo.
 */
const schema = new Schema(
  {
    period: { type: String, required: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'Estudiante', required: true },
    uid: { type: String, required: true },
    institutionId: { type: String, default: '' },
    /** La sesión en la que se ató: para poder explicar un rechazo después. */
    sessionId: { type: Schema.Types.ObjectId, ref: 'SesionAsistencia', default: null },
  },
  { timestamps: true, versionKey: false },
);

schema.index({ period: 1, studentId: 1 }, { unique: true });
schema.index({ period: 1, uid: 1 }, { unique: true });
schema.index({ uid: 1 });
schema.index({ studentId: 1 });

export const QrBindingModel = model('VinculoQrSemestre', schema, 'vinculos_qr_semestre');
