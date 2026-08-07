import { Schema, model } from 'mongoose';
import { baseFields } from './base.js';

/**
 * Realimentación del docente sobre una alerta de riesgo, y el desenlace real.
 *
 * Es la materia prima del aprendizaje: sin casos cerrados —"el sistema dijo
 * riesgo alto y el estudiante efectivamente reprobó"— no hay nada con qué
 * reentrenar. Un modelo que nunca recibe realimentación no aprende, solo repite.
 */
const schema = new Schema(
  {
    ...baseFields,
    studentId: { type: Schema.Types.ObjectId, ref: 'Estudiante', required: true, index: true },
    subjectId: { type: Schema.Types.ObjectId, ref: 'Materia', required: true, index: true },
    teacherId: { type: Schema.Types.ObjectId, ref: 'Usuario', index: true },
    period: { type: String, required: true, index: true },

    /** Nivel que predijo el sistema cuando se emitió la alerta. */
    predictedLevel: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH'], required: true },
    predictedProbability: { type: Number, default: 0 },
    modelVersion: { type: String, default: '' },

    /** Valoración del docente: ¿la alerta fue acertada? */
    teacherVerdict: { type: String, enum: ['ACCURATE', 'INACCURATE', 'UNSURE'], default: 'UNSURE' },
    teacherNote: { type: String, default: '' },

    /**
     * Desenlace real al cerrar el periodo. Es la etiqueta que se usa para
     * entrenar; mientras sea null, el caso todavía no sirve para aprender.
     */
    actuallyFailed: { type: Boolean, default: null },

    // ── Seguimiento de la intervención ──────────────────────────────────────
    //
    // Qué hizo el docente con la alerta. Sin esto el riesgo era un tablero que
    // informaba lo mismo cada semana: el docente no tenía dónde anotar que ya
    // había hablado con el estudiante, así que la lista no distinguía "aún no
    // lo he mirado" de "lo estoy siguiendo desde hace un mes".
    //
    // Además es la señal que hoy le falta al modelo: sabe predecir quién va a
    // reprobar, pero no qué intervención cambió el desenlace.
    interventionStatus: {
      type: String,
      enum: ['PENDIENTE', 'CONTACTADO', 'CITA_ACORDADA', 'NO_RESPONDE', 'RESUELTO'],
      default: 'PENDIENTE',
      index: true,
    },
    interventionNote: { type: String, default: '' },
    interventionAt: { type: Date, default: null },
    interventionBy: { type: Schema.Types.ObjectId, ref: 'Usuario', default: null },

    /** Señales congeladas en el momento de la predicción. */
    features: { type: Object, default: {} },
  },
  { timestamps: true }
);

// Un caso por estudiante, materia y periodo: la realimentación se actualiza,
// no se acumula en duplicados.
schema.index({ studentId: 1, subjectId: 1, period: 1 }, { unique: true });

export const RiskFeedbackModel = model('RiesgoRealimentacion', schema, 'riesgo_realimentacion');
