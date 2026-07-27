import { Schema, model } from 'mongoose';
import { baseFields } from './base.js';

const schema = new Schema(
  {
    ...baseFields,
    userId: { type: Schema.Types.ObjectId, ref: 'Usuario', required: true, index: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    type: { type: String, enum: ['CLASS', 'GRADE', 'RISK', 'ATTENDANCE', 'ACTIVITY', 'EXAM', 'DEADLINE'], required: true },
    channel: { type: String, enum: ['PUSH', 'EMAIL', 'IN_APP'], default: 'IN_APP' },
    readAt: { type: Date, default: null, index: true },
    metadata: { type: Object, default: {} },
  },
  { timestamps: true }
);

export const NotificationModel = model('Notificacion', schema, 'notificaciones');

