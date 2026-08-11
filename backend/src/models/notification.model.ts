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
    type: {
      type: String,
      enum: [
        'CLASS',
        'GRADE',
        'RISK',
        'ATTENDANCE',
        'ACTIVITY',
        'EXAM',
        'DEADLINE',
        // Añadidos con la agenda: un evento del calendario, un recordatorio
        // configurado por el docente y un cambio del propio horario.
        'EVENT',
        'REMINDER',
        'SCHEDULE',
        'SISTEMA',
      ],
      required: true,
    },
    channel: { type: String, enum: ['PUSH', 'EMAIL', 'IN_APP'], default: 'IN_APP' },
    /**
     * Cuánto corre. Ordena la bandeja y decide si atraviesa las horas de
     * silencio; no cambia quién la recibe, que eso lo decide `userId`.
     */
    priority: {
      type: String,
      enum: ['URGENT', 'IMPORTANT', 'INFO', 'SYSTEM'],
      default: 'INFO',
      index: true,
    },
    /**
     * Identidad del HECHO notificado, no del documento.
     *
     * Sin esto, el escáner de riesgo y el de clases crean una notificación por
     * pasada: quince avisos idénticos de la misma clase en quince minutos, que
     * es exactamente lo que enseña a un docente a ignorar la campana. Con una
     * clave estable ("clase X del día D con 15 min de antelación"), la segunda
     * pasada encuentra la primera y no escribe nada.
     *
     * El índice es único por usuario y parcial: la mayoría de notificaciones
     * antiguas no tienen clave, y un índice único normal las consideraría
     * todas duplicadas entre sí.
     */
    dedupeKey: { type: String, default: null },
    /**
     * A dónde lleva al tocarla. Ruta interna de la app —`/agenda?item=…`,
     * `/estudiantes?buscar=…`—, nunca una URL externa: abrir un navegador desde
     * una notificación del sistema académico es un vector de phishing regalado.
     */
    link: { type: String, default: '' },
    readAt: { type: Date, default: null, index: true },
    metadata: { type: Object, default: {} },
  },
  { timestamps: true },
);

schema.index(
  { userId: 1, dedupeKey: 1 },
  { unique: true, partialFilterExpression: { dedupeKey: { $type: 'string' } } },
);

// La bandeja siempre se lee igual: lo mío, lo más reciente primero.
schema.index({ userId: 1, createdAt: -1 });

export const NotificationModel = model('Notificacion', schema, 'notificaciones');
