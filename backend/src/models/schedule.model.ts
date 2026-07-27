import { Schema, model } from 'mongoose';
import { baseFields } from './base.js';

const schema = new Schema(
  {
    ...baseFields,
    subjectId: { type: Schema.Types.ObjectId, ref: 'Materia', required: true, index: true },
    groupId: { type: Schema.Types.ObjectId, ref: 'Grupo', default: null, index: true },
    teacherId: { type: Schema.Types.ObjectId, ref: 'Usuario', required: true, index: true },
    dayOfWeek: { type: Number, min: 1, max: 7, required: true, index: true },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    order: { type: Number, default: 0, index: true },
    durationMinutes: { type: Number, default: 90 },
    classroom: { type: String, default: '' },
    modality: { type: String, enum: ['PRESENTIAL', 'VIRTUAL', 'HYBRID'], default: 'PRESENTIAL' },
  },
  { timestamps: true }
);

schema.index({ subjectId: 1, dayOfWeek: 1, startTime: 1, teacherId: 1 }, { unique: true });

export const ScheduleModel = model('Horario', schema, 'horarios');
