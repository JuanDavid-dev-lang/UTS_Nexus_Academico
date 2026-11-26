import { Schema, model } from 'mongoose';
import { DIAS_DE_RETENCION } from '../domains/usage/usage.js';

/**
 * Uso diario: un documento por (persona, día del campus).
 *
 * Estadística interna para ADMIN (`GET /uso/resumen`). No guarda qué pantallas
 * se abrieron ni qué datos se consultaron: solo cuántas peticiones, en qué
 * cliente, en qué franjas de 5 minutos hubo actividad y la primera y la última.
 *
 * `franjas` son números de franja (0..287), no un contador: se escriben con
 * `$addToSet`, así que dos instancias del backend o dos clientes a la vez no
 * cuentan dos veces el mismo rato. Los minutos activos son `franjas × 5`.
 *
 * Se borra solo a los `DIAS_DE_RETENCION` días de la última actividad (TTL):
 * más de un año da para comparar un semestre con el mismo del año anterior, y
 * nada justifica guardarlo indefinidamente.
 */
const schema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'Usuario', required: true },
    institutionId: { type: Schema.Types.ObjectId, ref: 'Institucion', default: null },
    rol: { type: String, required: true },
    /** Día del campus, `AAAA-MM-DD`. */
    dia: { type: String, required: true },
    peticiones: { type: Number, default: 0 },
    porCliente: {
      escritorio: { type: Number, default: 0 },
      web: { type: Number, default: 0 },
      movil: { type: Number, default: 0 },
    },
    franjas: { type: [Number], default: [] },
    primeraActividad: { type: Date, required: true },
    ultimaActividad: { type: Date, required: true },
  },
  { versionKey: false },
);

schema.index({ userId: 1, dia: 1 }, { unique: true });
schema.index({ dia: 1 });
schema.index({ ultimaActividad: 1 }, { expireAfterSeconds: DIAS_DE_RETENCION * 24 * 60 * 60 });

export const UsageDayModel = model('UsoDiario', schema, 'uso_diario');
