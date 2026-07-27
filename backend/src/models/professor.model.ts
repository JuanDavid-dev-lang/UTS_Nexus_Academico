import { Schema, model } from 'mongoose';
import { baseFields } from './base.js';

const schema = new Schema(
  {
    ...baseFields,
    userId: { type: Schema.Types.ObjectId, ref: 'Usuario', required: true, unique: true, index: true },
    employeeCode: { type: String, default: null, index: true },
    department: { type: String, default: 'UTS' },
    title: { type: String, default: 'Docente' },
    photoUrl: { type: String, default: null },
    signatureUrl: { type: String, default: null },
  },
  { timestamps: true }
);

export const ProfessorModel = model('Profesor', schema, 'profesores');

