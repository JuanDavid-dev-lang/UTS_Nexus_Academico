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
    notes: { type: String, default: '' },
  },
  { timestamps: true }
);

schema.index({ studentId: 1, subjectId: 1, date: 1 }, { unique: true });

export const AttendanceModel = model('Asistencia', schema, 'asistencias');
