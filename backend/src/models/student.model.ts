import { Schema, model } from 'mongoose';
import { baseFields } from './base.js';

const schema = new Schema(
  {
    ...baseFields,
    code: { type: String, required: true, unique: true, index: true },
    fullName: { type: String, required: true, index: true },
    // Nullable durante la transición: hay expedientes históricos cuyo correo
    // nunca se capturó. Cuando existe, las rutas lo normalizan y validan antes
    // de escribirlo.
    email: { type: String, default: null, trim: true, lowercase: true },
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

// El índice único parcial se crea deliberadamente desde
// `migrate-student-emails.ts`, DESPUÉS de auditar los datos existentes. Si se
// declarara aquí, autoIndex podría intentar crearlo al arrancar sobre una base
// histórica con duplicados y convertir una migración controlada en un fallo de
// inicio difícil de diagnosticar.

export const StudentModel = model('Estudiante', schema, 'estudiantes');

