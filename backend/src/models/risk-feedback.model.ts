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

    // ── Seguimiento: episodios de acompañamiento ────────────────────────────
    //
    // Un episodio nace cuando el docente decide QUÉ va a hacer con el caso
    // (llamar, recomendar tutoría, una charla) y se cierra con su resultado:
    // BIEN (hubo charla o solución) o NEGADO (el estudiante no aceptó el
    // acompañamiento). Un caso puede acumular varios episodios a lo largo del
    // semestre; que uno anterior haya terminado NEGADO es justo lo que el
    // docente necesita saber antes de abrir otro.
    //
    // Vive dentro del mismo caso que la predicción y la intervención porque es
    // la misma historia: qué predijo el sistema, qué hizo el docente y cómo
    // terminó.
    seguimientos: [
      {
        accion: {
          type: String,
          enum: ['LLAMADA', 'TUTORIA', 'CHARLA', 'OTRA'],
          required: true,
        },
        nota: { type: String, default: '' },
        estado: {
          type: String,
          enum: ['EN_CURSO', 'BIEN', 'NEGADO'],
          default: 'EN_CURSO',
        },
        /** Nivel de riesgo cuando se abrió: contra esto se evalúa el progreso. */
        nivelAlCrear: { type: String, enum: ['BAJO', 'MEDIO', 'ALTO'], required: true },
        /** Nivel al cerrarse. Comparado con el de apertura dice si mejoró. */
        nivelAlCerrar: { type: String, enum: ['BAJO', 'MEDIO', 'ALTO'], default: null },
        notaCierre: { type: String, default: '' },
        creadoPor: { type: Schema.Types.ObjectId, ref: 'Usuario' },
        creadoEn: { type: Date, default: Date.now },
        cerradoEn: { type: Date, default: null },
        /** El recordatorio de las 24 h se envía una sola vez. */
        recordatorioEnviado: { type: Boolean, default: false },
      },
    ],
  },
  { timestamps: true }
);

// Un caso por estudiante, materia y periodo: la realimentación se actualiza,
// no se acumula en duplicados.
schema.index({ studentId: 1, subjectId: 1, period: 1 }, { unique: true });

export const RiskFeedbackModel = model('RiesgoRealimentacion', schema, 'riesgo_realimentacion');
