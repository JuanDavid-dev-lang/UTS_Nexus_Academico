import { Schema, model } from 'mongoose';
import { baseFields } from './base.js';

/**
 * Dispositivo registrado para notificaciones push.
 *
 * Un usuario puede tener varios (teléfono, tablet, otro teléfono prestado). El
 * token es de FCM y lo rota Android por su cuenta, así que la unicidad va por
 * token y no por usuario: si el mismo token reaparece bajo otra cuenta —el
 * segundo docente que entra en el teléfono de la sala de profesores— tiene que
 * cambiar de dueño, no duplicarse. De lo contrario el docente nuevo recibiría
 * las alertas del anterior, que son datos académicos de otra persona.
 */
const schema = new Schema(
  {
    ...baseFields,
    userId: { type: Schema.Types.ObjectId, ref: 'Usuario', required: true, index: true },
    token: { type: String, required: true, unique: true, index: true },
    platform: { type: String, enum: ['ANDROID', 'IOS', 'WEB', 'DESKTOP'], default: 'ANDROID', index: true },
    deviceName: { type: String, default: '' },
    appVersion: { type: String, default: '' },
    /**
     * El teléfono programa los recordatorios de clase por su cuenta (alarmas
     * locales, funcionan sin red y con la app cerrada). Cuando está en `true`,
     * el servidor NO le manda push de tipo CLASS: el docente recibiría el mismo
     * aviso dos veces, y un recordatorio duplicado enseña a ignorarlos.
     */
    localClassReminders: { type: Boolean, default: false },
    lastSeenAt: { type: Date, default: Date.now },
    /** Último fallo de entrega, para poder diagnosticar sin abrir la consola de FCM. */
    lastErrorAt: { type: Date, default: null },
    lastError: { type: String, default: '' },
  },
  { timestamps: true },
);

export const DeviceModel = model('Dispositivo', schema, 'dispositivos');
