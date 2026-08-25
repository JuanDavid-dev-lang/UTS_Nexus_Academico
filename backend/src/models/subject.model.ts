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
    /**
     * Programa académico al que pertenece la materia (id del catálogo).
     *
     * Es lo que decide qué coordinación la ve. Nulo en los datos anteriores a
     * este campo: para esos, el alcance cae en la adscripción del docente que
     * la dicta (`domains/scope/program-scope.ts`). El respaldo no es opcional
     * —sin él, actualizar habría sacado del alcance a todas las materias
     * históricas de golpe— pero es aproximado: una materia con `programa`
     * escrito manda siempre sobre él.
     */
    programa: { type: String, default: null, index: true },
    scheduleIds: [{ type: Schema.Types.ObjectId, ref: 'Horario' }],
    studentIds: [{ type: Schema.Types.ObjectId, ref: 'Estudiante' }],
  },
  { timestamps: true }
);

schema.index({ professorId: 1, period: 1, code: 1 }, { unique: true });

export const SubjectModel = model('Materia', schema, 'materias');

