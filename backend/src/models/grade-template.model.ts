import { Schema, model } from 'mongoose';
import { baseFields } from './base.js';

/**
 * Cómo reparte un docente las notas de un corte: qué notas lleva cada
 * componente y con qué peso relativo. Es del docente, no de la materia: cada
 * uno califica a su manera y la plantilla se reutiliza semestre tras semestre.
 *
 * La lógica de qué es válido vive en `domains/grading/plantilla-notas.ts`.
 */
const notaPlantillaSchema = new Schema(
  {
    label: { type: String, required: true, trim: true, maxlength: 60 },
    weight: { type: Number, required: true, min: 0.01, max: 1000 },
  },
  { _id: false }
);

export const componentePlantillaSchema = new Schema(
  {
    tipo: { type: String, enum: ['TRABAJOS', 'PARCIALES', 'AUTOEVALUACION'], required: true },
    notas: { type: [notaPlantillaSchema], default: [] },
  },
  { _id: false }
);

const schema = new Schema(
  {
    ...baseFields,
    professorId: { type: Schema.Types.ObjectId, ref: 'Usuario', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    componentes: { type: [componentePlantillaSchema], default: [] },
  },
  { timestamps: true }
);

// Dos plantillas con el mismo nombre del mismo docente serían indistinguibles
// en el desplegable. Parcial: una borrada libera el nombre.
schema.index(
  { professorId: 1, name: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } }
);

export const GradeTemplateModel = model('PlantillaNotas', schema, 'plantillas_notas');
