import { Schema, model } from 'mongoose';
import { baseFields } from './base.js';

/**
 * Nota atómica capturada por el docente. La nota del corte y la nota final NO se
 * guardan aquí: se derivan con el motor de calificación (domains/grading) para
 * garantizar una única fuente de verdad. Cada documento es una calificación de un
 * componente (trabajos / parciales / autoevaluación) dentro de un corte (1/2/3).
 */
const schema = new Schema(
  {
    ...baseFields,
    studentId: { type: Schema.Types.ObjectId, ref: 'Estudiante', required: true, index: true },
    subjectId: { type: Schema.Types.ObjectId, ref: 'Materia', required: true, index: true },
    groupId: { type: Schema.Types.ObjectId, ref: 'Grupo', default: null, index: true },
    teacherId: { type: Schema.Types.ObjectId, ref: 'Usuario', required: true, index: true },
    corte: { type: Number, enum: [1, 2, 3], required: true, index: true },
    componentType: {
      type: String,
      enum: ['TRABAJOS', 'PARCIALES', 'AUTOEVALUACION'],
      required: true,
      index: true,
    },
    /** Etiqueta legible para distinguir varias notas del mismo componente (ej. "Taller 1"). */
    label: { type: String, default: 'Nota' },
    /** Campo legado de versiones previas; se conserva para compatibilidad de lectura. */
    component: { type: String, default: null },
    score: { type: Number, required: true, min: 0, max: 5 },
    maxScore: { type: Number, default: 5 },
    period: { type: String, required: true, index: true },
  },
  { timestamps: true }
);

// Permite múltiples notas por componente distinguidas por `label`.
schema.index(
  { studentId: 1, subjectId: 1, period: 1, corte: 1, componentType: 1, label: 1 },
  { unique: true }
);

export const GradeModel = model('Nota', schema, 'notas');
