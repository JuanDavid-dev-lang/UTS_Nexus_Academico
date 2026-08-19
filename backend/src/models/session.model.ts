import { Schema, model } from 'mongoose';

const schema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'Usuario', required: true, index: true },
    refreshTokenHash: { type: String, required: true },
    /**
     * Hash del token que la última rotación dejó atrás.
     *
     * `refreshTokenHash` se sobrescribe en cada `/auth/refresh`: el hash
     * anterior deja de existir en cualquier documento. Sin guardarlo aparte,
     * la comprobación de reuso de `/auth/refresh` no tenía contra qué
     * comparar un token ya canjeado — buscaba el hash viejo en
     * `refreshTokenHash`, campo que ya lo había reemplazado por el nuevo, así
     * que nunca coincidía con nada y la detección de robo estaba muerta en la
     * práctica salvo para un token ya cerrado con `/logout`. Guarda solo una
     * generación atrás: es la que corresponde a "alguien canjeó el token que
     * el dueño legítimo todavía tenía".
     */
    previousRefreshTokenHash: { type: String, default: null, index: true },
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

/** La misma consulta, pero para la detección de reuso sobre el hash anterior. */
schema.index({ userId: 1, previousRefreshTokenHash: 1 });

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
