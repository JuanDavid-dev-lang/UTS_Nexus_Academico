import { Schema, model } from 'mongoose';
import { baseFields } from './base.js';

/**
 * Matrícula: ata un estudiante (identidad global por cédula) a un grupo/materia
 * en un periodo concreto. Es la relación de propiedad real:
 *
 *   Profesor → Materia → Grupo → Matrícula → Estudiante
 *
 * El scoping por profesor y "cada grupo tiene sus estudiantes propios" se derivan
 * de esta colección. Reemplaza a los arreglos `studentIds[]` en Materia/Grupo.
 */
const schema = new Schema(
  {
    ...baseFields,
    studentId: { type: Schema.Types.ObjectId, ref: 'Estudiante', required: true, index: true },
    groupId: { type: Schema.Types.ObjectId, ref: 'Grupo', required: true, index: true },
    subjectId: { type: Schema.Types.ObjectId, ref: 'Materia', required: true, index: true },
    professorId: { type: Schema.Types.ObjectId, ref: 'Usuario', required: true, index: true },
    period: { type: String, required: true, index: true },
    enrollmentStatus: {
      type: String,
      enum: ['ACTIVE', 'WITHDRAWN', 'FINISHED'],
      default: 'ACTIVE',
      index: true,
    },
  },
  { timestamps: true }
);

// Un estudiante no puede estar matriculado dos veces en el mismo grupo/periodo.
schema.index({ studentId: 1, groupId: 1, period: 1 }, { unique: true });

export const EnrollmentModel = model('Matricula', schema, 'matriculas');
