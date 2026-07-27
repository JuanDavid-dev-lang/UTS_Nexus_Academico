import { Schema, model } from 'mongoose';
import { baseFields } from './base.js';

const schema = new Schema(
  {
    ...baseFields,
    name: { type: String, required: true, index: true },
    code: { type: String, required: true, index: true },
    professorId: { type: Schema.Types.ObjectId, ref: 'Usuario', required: true, index: true },
    period: { type: String, required: true, index: true },
    credits: { type: Number, default: 0 },
    scheduleIds: [{ type: Schema.Types.ObjectId, ref: 'Horario' }],
    studentIds: [{ type: Schema.Types.ObjectId, ref: 'Estudiante' }],
  },
  { timestamps: true }
);

schema.index({ professorId: 1, period: 1, code: 1 }, { unique: true });

export const SubjectModel = model('Materia', schema, 'materias');

