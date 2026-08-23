import { Schema, model } from 'mongoose';
import { baseFields } from './base.js';

/**
 * Evento de la agenda académica.
 *
 * Es lo que NO se repite todas las semanas: un parcial, una entrega, una
 * tutoría, una reunión, un recordatorio. Las clases NO viven aquí — siguen
 * siendo `Horario` (`ScheduleModel`), que ya existía, y la agenda las expande a
 * ocurrencias con fecha. Duplicar el horario en esta colección habría dado dos
 * fuentes de verdad para lo mismo y un desfase garantizado en cuanto alguien
 * moviera una franja.
 *
 * `dueAt` de `Actividad` (`ActivityModel`) tampoco se migra: esa colección ya
 * alimenta las entregas del docente y la agenda la lee tal cual.
 */
const schema = new Schema(
  {
    ...baseFields,
    title: { type: String, required: true },
    description: { type: String, default: '' },
    type: {
      type: String,
      enum: [
        'EVALUATION', // evaluación / quiz
        'EXAM', // parcial
        'DELIVERY', // entrega
        'ACTIVITY', // actividad de clase
        'MEETING', // reunión
        'TUTORING', // tutoría
        'ACADEMIC', // evento académico institucional
        'REMINDER', // recordatorio personal
      ],
      required: true,
      index: true,
    },
    /** Dueño del evento: quien lo creó y quien recibe sus recordatorios. */
    teacherId: { type: Schema.Types.ObjectId, ref: 'Usuario', default: null, index: true },
    visibility: { type: String, enum: ['PERSONAL', 'INSTITUTIONAL'], default: 'PERSONAL', index: true },
    importBatchId: { type: String, default: null, index: true },
    externalKey: { type: String, default: null },
    subjectId: { type: Schema.Types.ObjectId, ref: 'Materia', default: null, index: true },
    groupId: { type: Schema.Types.ObjectId, ref: 'Grupo', default: null, index: true },
    /** Instante absoluto (UTC). La hora de pared se resuelve con el desfase del campus. */
    startAt: { type: Date, required: true, index: true },
    endAt: { type: Date, default: null },
    /** Un evento de día completo no tiene hora y no dispara avisos por minutos. */
    allDay: { type: Boolean, default: false },
    location: { type: String, default: '' },
    priority: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'], default: 'MEDIUM', index: true },
    /**
     * Minutos de antelación de cada recordatorio. `0` significa "al empezar".
     * Vacío = sin recordatorio. Se normaliza en la ruta, no aquí.
     */
    reminderMinutes: { type: [Number], default: [] },
    /** Semestre al que pertenece, para poder filtrar como el resto del sistema. */
    period: { type: String, default: '', index: true },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// La consulta natural de la agenda: "lo mío entre estas dos fechas".
schema.index({ teacherId: 1, startAt: 1, deletedAt: 1 });
schema.index(
  { externalKey: 1 },
  { unique: true, partialFilterExpression: { externalKey: { $type: 'string' }, deletedAt: null } },
);

export const CalendarEventModel = model('EventoCalendario', schema, 'eventos_calendario');
