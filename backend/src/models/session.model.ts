import { Schema, model } from 'mongoose';

const schema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'Usuario', required: true, index: true },
    refreshTokenHash: { type: String, required: true },
    revokedAt: { type: Date, default: null, index: true },
    expiresAt: { type: Date, required: true },
    device: { type: String, default: 'unknown' },
  },
  { timestamps: true }
);

/**
 * Consulta de `/auth/refresh`, en un solo índice.
 *
 * Se busca siempre por (usuario, hash del token). Con solo el índice de
 * `userId`, Mongo recorría todas las sesiones de esa persona —una por cada
 * inicio de sesión de cada dispositivo desde que existe la cuenta— comparando
 * el hash a mano en cada renovación.
 */
schema.index({ userId: 1, refreshTokenHash: 1 });

/**
 * Barrido automático de sesiones vencidas.
 *
 * `expireAfterSeconds: 0` le dice a Mongo que borre el documento cuando la
 * fecha de `expiresAt` quede atrás. Sin esto la colección solo crecía: nada
 * borraba nunca una sesión caducada, así que un usuario acumulaba una fila
 * muerta por cada inicio de sesión de su vida y la consulta de renovación se
 * volvía más lenta con cada mes de uso.
 *
 * Sustituye al índice suelto de `expiresAt`: este también sirve para el filtro
 * `expiresAt: { $gt: ... }`.
 */
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const SessionModel = model('Sesion', schema, 'sesiones');
