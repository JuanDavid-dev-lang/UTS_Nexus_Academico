import { Schema, model } from 'mongoose';
import { baseFields } from './base.js';
import { componentePlantillaSchema } from './grade-template.model.js';

/**
 * Una plantilla **aplicada**: la estructura de notas de cada corte para una
 * materia en un periodo, y opcionalmente para un solo grupo de ella.
 *
 * Es una copia y no una referencia a la plantilla: editar la plantilla después
 * no cambia cómo se calificó a un grupo que ya la tenía puesta. `plantillaId`
 * queda solo como rastro de dónde salió.
 *
 * `groupId: null` vale para todos los grupos de la materia; una estructura
 * con grupo manda sobre la de la materia (ver `estructuraPara`).
 */
const corteEstructuraSchema = new Schema(
  {
    corte: { type: Number, enum: [1, 2, 3], required: true },
    componentes: { type: [componentePlantillaSchema], default: [] },
  },
  { _id: false }
);

const schema = new Schema(
  {
    ...baseFields,
    subjectId: { type: Schema.Types.ObjectId, ref: 'Materia', required: true, index: true },
    groupId: { type: Schema.Types.ObjectId, ref: 'Grupo', default: null, index: true },
    period: { type: String, required: true, index: true },
    professorId: { type: Schema.Types.ObjectId, ref: 'Usuario', required: true, index: true },
    plantillaId: { type: Schema.Types.ObjectId, ref: 'PlantillaNotas', default: null },
    nombre: { type: String, default: '', trim: true, maxlength: 80 },
    cortes: { type: [corteEstructuraSchema], default: [] },
  },
  { timestamps: true }
);

schema.index(
  { subjectId: 1, groupId: 1, period: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } }
);

export const GradeStructureModel = model('EstructuraNotas', schema, 'estructuras_notas');
