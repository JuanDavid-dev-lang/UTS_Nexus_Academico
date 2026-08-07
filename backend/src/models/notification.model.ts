import { Schema, model } from 'mongoose';
import { baseFields } from './base.js';

const schema = new Schema(
  {
    ...baseFields,
    userId: { type: Schema.Types.ObjectId, ref: 'Usuario', required: true, index: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    // SISTEMA es la aplicación hablando de sí misma —una versión nueva, un
    // mantenimiento—, no un hecho académico. Se distingue de los demás porque
    // no cuelga de ninguna materia ni de ningún estudiante.
    type: { type: String, enum: ['CLASS', 'GRADE', 'RISK', 'ATTENDANCE', 'ACTIVITY', 'EXAM', 'DEADLINE', 'SISTEMA'], required: true },
    channel: { type: String, enum: ['PUSH', 'EMAIL', 'IN_APP'], default: 'IN_APP' },
    readAt: { type: Date, default: null, index: true },
    metadata: { type: Object, default: {} },
  },
  { timestamps: true }
);

export const NotificationModel = model('Notificacion', schema, 'notificaciones');

