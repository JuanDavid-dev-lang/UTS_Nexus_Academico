import { Schema, model } from 'mongoose';
import { baseFields } from './base.js';

/**
 * Sugerencia o reporte de error SOBRE LA PLATAFORMA, enviado por un docente.
 *
 * No confundir con `RiskFeedbackModel`: aquel es la realimentación del docente
 * sobre una predicción de riesgo (alimenta al modelo ML). Este es el buzón de
 * la aplicación — "esta pantalla falla", "estaría bien poder X" — y lo revisa
 * la administración.
 */
const schema = new Schema(
  {
    ...baseFields,
    tipo: {
      type: String,
      enum: ['SUGERENCIA', 'ERROR'],
      default: 'SUGERENCIA',
      index: true,
    },
    mensaje: { type: String, required: true, trim: true },
    /** Quién lo envió. Un reporte anónimo no se puede responder ni aclarar. */
    autorId: { type: Schema.Types.ObjectId, ref: 'Usuario', required: true, index: true },
    /** Desde qué cliente llegó; orienta a reproducir un error. */
    origen: { type: String, enum: ['DESKTOP', 'MOBILE'], default: 'DESKTOP' },
    appVersion: { type: String, default: null },
    estado: {
      type: String,
      enum: ['NUEVO', 'EN_REVISION', 'RESUELTO', 'DESCARTADO'],
      default: 'NUEVO',
      index: true,
    },
    revisadoPor: { type: Schema.Types.ObjectId, ref: 'Usuario', default: null },
  },
  { timestamps: true }
);

// La bandeja del admin lista por estado y de lo más nuevo a lo más viejo.
schema.index({ estado: 1, createdAt: -1 });

export const FeedbackModel = model('FeedbackApp', schema, 'feedback_app');
