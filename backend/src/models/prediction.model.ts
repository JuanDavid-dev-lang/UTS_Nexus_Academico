import { Schema, model } from 'mongoose';
import { baseFields } from './base.js';

const schema = new Schema(
  {
    ...baseFields,
    studentId: { type: Schema.Types.ObjectId, ref: 'Estudiante', required: true, index: true },
    subjectId: { type: Schema.Types.ObjectId, ref: 'Materia', required: true, index: true },
    teacherId: { type: Schema.Types.ObjectId, ref: 'Usuario', required: true, index: true },
    riskLevel: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH'], required: true },
    neededToPass: { type: Number, default: 0 },
    scenario: { type: Object, default: {} },
    rationale: { type: String, default: '' },
  },
  { timestamps: true }
);

schema.index({ studentId: 1, subjectId: 1, createdAt: -1 });

export const PredictionModel = model('Prediccion', schema, 'predicciones');

