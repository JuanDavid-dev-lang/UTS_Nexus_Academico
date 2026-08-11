import { Schema, model } from 'mongoose';
import { baseFields } from './base.js';

/**
 * Preferencias de notificación por usuario.
 *
 * Un documento por usuario, creado la primera vez que se consulta. Los valores
 * por defecto están puestos para que quien nunca entre a esta pantalla siga
 * recibiendo lo importante: apagar por omisión convertiría una función nueva en
 * una función invisible.
 *
 * Las categorías son las mismas que usa el resto del sistema para clasificar,
 * no una lista paralela: `categoriaDeNotificacion()` en `shared/notify.ts` es
 * quien traduce un `type` de notificación a una de estas claves.
 */
const categoria = { type: Boolean, default: true };

const schema = new Schema(
  {
    ...baseFields,
    userId: { type: Schema.Types.ObjectId, ref: 'Usuario', required: true, unique: true, index: true },

    // ── Qué recibir ────────────────────────────────────────────────────────
    clases: categoria,
    evaluaciones: categoria,
    asistencia: categoria,
    riesgo: categoria,
    intervenciones: categoria,
    eventos: categoria,
    recordatorios: categoria,
    sincronizacion: { type: Boolean, default: false },
    sistema: categoria,

    // ── Cómo recibirlo ─────────────────────────────────────────────────────
    inApp: { type: Boolean, default: true },
    push: { type: Boolean, default: true },
    email: { type: Boolean, default: false },

    /**
     * Antelaciones de los recordatorios de clase, en minutos. `0` = "empieza
     * ahora". La UI ofrece 5/10/15/30/60/1440; el modelo no lo restringe para
     * no tener que migrar si mañana se añade otra.
     */
    classLeadMinutes: { type: [Number], default: [15] },

    /**
     * Horas de silencio: dentro de la franja no se envía push ni correo, pero
     * la notificación SÍ se crea. Silenciar es dejar de sonar, no dejar de
     * enterarse: al abrir la app tiene que estar ahí.
     */
    quietHours: {
      enabled: { type: Boolean, default: false },
      start: { type: String, default: '21:00' },
      end: { type: String, default: '06:00' },
    },

    /**
     * Las urgentes ignoran el silencio. Es la razón por la que existe la
     * prioridad URGENTE, y apagarlo es una decisión del usuario, no un defecto.
     */
    urgentBypassesQuietHours: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export const NotificationPreferenceModel = model(
  'PreferenciaNotificacion',
  schema,
  'preferencias_notificacion',
);

/** Forma que devuelve la API (y que espera el cliente) con todo resuelto. */
export type PreferenciasResueltas = {
  clases: boolean;
  evaluaciones: boolean;
  asistencia: boolean;
  riesgo: boolean;
  intervenciones: boolean;
  eventos: boolean;
  recordatorios: boolean;
  sincronizacion: boolean;
  sistema: boolean;
  inApp: boolean;
  push: boolean;
  email: boolean;
  classLeadMinutes: number[];
  quietHours: { enabled: boolean; start: string; end: string };
  urgentBypassesQuietHours: boolean;
};

export const PREFERENCIAS_POR_DEFECTO: PreferenciasResueltas = {
  clases: true,
  evaluaciones: true,
  asistencia: true,
  riesgo: true,
  intervenciones: true,
  eventos: true,
  recordatorios: true,
  sincronizacion: false,
  sistema: true,
  inApp: true,
  push: true,
  email: false,
  classLeadMinutes: [15],
  quietHours: { enabled: false, start: '21:00', end: '06:00' },
  urgentBypassesQuietHours: true,
};
