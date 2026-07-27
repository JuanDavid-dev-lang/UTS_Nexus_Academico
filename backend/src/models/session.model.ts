import { Schema, model } from 'mongoose';

const schema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'Usuario', required: true, index: true },
    refreshTokenHash: { type: String, required: true },
    revokedAt: { type: Date, default: null, index: true },
    expiresAt: { type: Date, required: true, index: true },
    device: { type: String, default: 'unknown' },
  },
  { timestamps: true }
);

export const SessionModel = model('Sesion', schema, 'sesiones');

