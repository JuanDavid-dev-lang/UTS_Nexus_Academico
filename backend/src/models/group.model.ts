import { Schema, model } from 'mongoose';
import { baseFields } from './base.js';

const schema = new Schema(
  {
    ...baseFields,
    name: { type: String, required: true },
    subjectId: { type: Schema.Types.ObjectId, ref: 'Materia', required: true, index: true },
    professorId: { type: Schema.Types.ObjectId, ref: 'Usuario', required: true, index: true },
    period: { type: String, required: true, index: true },
    studentIds: [{ type: Schema.Types.ObjectId, ref: 'Estudiante' }],
  },
  { timestamps: true }
);

schema.index({ subjectId: 1, period: 1, name: 1 }, { unique: true });

export const GroupModel = model('Grupo', schema, 'grupos');

