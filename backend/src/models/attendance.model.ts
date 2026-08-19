import { Schema, model } from 'mongoose';
import { baseFields } from './base.js';

const schema = new Schema(
  {
    ...baseFields,
    studentId: { type: Schema.Types.ObjectId, ref: 'Estudiante', required: true, index: true },
    subjectId: { type: Schema.Types.ObjectId, ref: 'Materia', required: true, index: true },
    groupId: { type: Schema.Types.ObjectId, ref: 'Grupo', default: null, index: true },
    teacherId: { type: Schema.Types.ObjectId, ref: 'Usuario', required: true, index: true },
    period: { type: String, default: '2026-1', index: true },
    date: { type: Date, required: true, index: true },
    durationMinutes: { type: Number, default: 90 },
    present: { type: Boolean, default: true },
    /**
     * Minutos de retraso sobre el inicio de la clase. `0` = llegó a tiempo.
     *
     * Es opcional y con valor por defecto para que los registros anteriores
     * sigan siendo válidos: sin este campo no había forma de distinguir «llegó
     * tarde» de «vino», y un patrón de tardanzas repetidas no se puede detectar
     * a partir de un booleano. **No se infiere**: una planilla escaneada o una
     * lista pegada no traen la hora de llegada, así que lo que no se capturó a
     * mano se queda en 0 en vez de inventarse un retraso que nadie observó.
     */
    lateMinutes: { type: Number, default: 0, min: 0 },
    notes: { type: String, default: '' },
  },
  { timestamps: true }
);

schema.index({ studentId: 1, subjectId: 1, date: 1 }, { unique: true });

export const AttendanceModel = model('Asistencia', schema, 'asistencias');
