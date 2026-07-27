import { Schema, model } from 'mongoose';
import { baseFields } from './base.js';

const schema = new Schema(
  {
    ...baseFields,
    code: { type: String, required: true, unique: true, index: true },
    fullName: { type: String, required: true, index: true },
    email: { type: String, required: true, lowercase: true },
    program: { type: String, required: true },
    photoUrl: { type: String, default: null },
    academicHistory: [
      {
        subjectId: { type: Schema.Types.ObjectId, ref: 'Materia' },
        average: Number,
        approved: Boolean,
      },
    ],
    attendanceRate: { type: Number, default: 0 },
    academicPerformance: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const StudentModel = model('Estudiante', schema, 'estudiantes');

