import { Schema, model } from 'mongoose';
import { baseFields } from './base.js';

/**
 * Sesión de asistencia por QR: una clase concreta pasando lista con UniPlanner.
 *
 * Existe mientras el QR está en pantalla. Lo que queda después —la asistencia
 * de cada estudiante— vive en `asistencias` como cualquier otra marca, con
 * `origen: 'QR'`; esta colección guarda cómo se llegó a ella: quién escaneó,
 * cuándo, desde qué teléfono y qué marcas se rechazaron y por qué.
 *
 * Las marcas van **dentro** del documento y no en una colección aparte: una
 * clase no pasa de unas decenas, se leen siempre juntas, y así la sesión se
 * actualiza de una sola escritura por lectura de Firestore.
 */
const enlaceSchema = new Schema(
  {
    studentId: { type: Schema.Types.ObjectId, ref: 'Estudiante', required: true },
    /** Nombre del documento en `institution_links`, ya calculado. */
    linkId: { type: String, required: true },
    /** Cuenta de UniPlanner que reclamó ese enlace. */
    uid: { type: String, required: true },
    /** Hasta cuándo está fijo el enlace, según lo último que se escribió allí. */
    bloqueadoHasta: { type: Date, default: null },
  },
  { _id: false },
);

const marcaSchema = new Schema(
  {
    uid: { type: String, required: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'Estudiante', default: null },
    deviceId: { type: String, default: '' },
    /** Hora del servidor de Firestore al crear la marca. */
    creadaEn: { type: Date, required: true },
    /**
     * `PENDIENTE`: la persona ya vio su nombre y su clase y falta que confirme.
     * Hasta entonces no se escribe ninguna asistencia.
     */
    estado: { type: String, enum: ['PENDIENTE', 'ACEPTADA', 'RECHAZADA'], required: true },
    /** Cuándo pulsó «Confirmar», con la hora del servidor de Firestore. */
    confirmadaEn: { type: Date, default: null },
    motivo: { type: String, default: null },
    /** Si ya se le contestó en su marca de Firestore. Se reintenta si no. */
    respondida: { type: Boolean, default: false },
    /** Cuántas veces lo intentó esta cuenta en la clase (`MAX_INTENTOS`). */
    intentos: { type: Number, default: 1 },
  },
  { _id: false },
);

const schema = new Schema(
  {
    ...baseFields,
    subjectId: { type: Schema.Types.ObjectId, ref: 'Materia', required: true, index: true },
    /** `null` si la sesión es de la materia entera, como la pantalla de asistencia. */
    groupId: { type: Schema.Types.ObjectId, ref: 'Grupo', default: null },
    scheduleId: { type: Schema.Types.ObjectId, ref: 'Horario', default: null },
    /** Docente que dicta la materia: es el `teacherId` de la asistencia que se escribe. */
    teacherId: { type: Schema.Types.ObjectId, ref: 'Usuario', required: true, index: true },
    abiertaPor: { type: Schema.Types.ObjectId, ref: 'Usuario', required: true },
    period: { type: String, required: true },
    /** Fecha canónica de la clase (`class-date.ts`): la misma que `Asistencia.date`. */
    date: { type: Date, required: true },
    durationMinutes: { type: Number, default: 90 },
    /** Clave de la institución en UniPlanner (`Institucion.institutionId`). */
    institutionId: { type: String, required: true },

    estado: {
      type: String,
      enum: ['ABIERTA', 'CERRADA'],
      default: 'ABIERTA',
      index: true,
    },
    abiertaEn: { type: Date, required: true },
    /** Hasta cuándo acepta marcas. Un cierre anticipado lo adelanta. */
    cierraEn: { type: Date, required: true },
    cerradaEn: { type: Date, default: null },
    /** `null` si la cerró el sistema al vencer. */
    cerradaPor: { type: Schema.Types.ObjectId, ref: 'Usuario', default: null },
    motivoCierre: {
      type: String,
      enum: ['DOCENTE', 'VENCIDA', 'PERIODO', null],
      default: null,
    },
    /** Si al cerrar se marca ausente a quien no escaneó y no tenía marca. */
    marcarAusentes: { type: Boolean, default: true },
    ausentesMarcados: { type: Number, default: 0 },
    /**
     * Cerrada aquí y todavía abierta en Firestore: el cierre allá falló. El
     * lector lo reintenta en cada barrido.
     */
    cierrePendiente: { type: Boolean, default: false },

    /**
     * Secreto con el que se firma el QR. **Nunca sale del servidor**: con él,
     * cualquiera generaría el QR desde su casa.
     */
    secreto: { type: String, required: true, select: false },
    /** Lo que se ve en el QR y en UniPlanner antes de marcar. */
    visibles: {
      materia: { type: String, default: '' },
      grupo: { type: String, default: '' },
      hora: { type: String, default: '' },
    },
    /**
     * Hasta cuándo queda fijo el enlace de quien confirma en esta clase: el
     * último día del semestre (`domains/periods/period-calendar.ts`). Se
     * calcula al abrir, una vez.
     */
    bloqueoHasta: { type: Date, default: null },
    /** Para la confirmación: se resuelven una vez al abrir, no en cada marca. */
    nombreMateria: { type: String, default: '' },
    nombreDocente: { type: String, default: '' },

    /** Matriculados al abrir, con el grupo de cada uno. */
    matriculados: [
      {
        _id: false,
        studentId: { type: Schema.Types.ObjectId, ref: 'Estudiante', required: true },
        groupId: { type: Schema.Types.ObjectId, ref: 'Grupo', default: null },
      },
    ],
    enlaces: { type: [enlaceSchema], default: [] },
    marcas: { type: [marcaSchema], default: [] },
    /**
     * Hora de la última marca leída de Firestore. La siguiente lectura pide
     * desde aquí, así que cada pasada cuesta lo que llegó nuevo y no la lista
     * entera otra vez.
     */
    cursor: { type: Date, default: null },
    /** Lo mismo para las confirmaciones, que son ediciones de marcas viejas. */
    cursorConfirmaciones: { type: Date, default: null },
    /**
     * Sube con cada escritura de la lista de marcas. Una pasada que leyó una
     * revisión y encuentra otra no escribe: otra instancia llegó antes, y
     * pisarle la lista le borraría una transición.
     */
    revision: { type: Number, default: 0 },
  },
  { timestamps: true },
);

// El lector busca las abiertas; la pantalla, la abierta de una materia.
schema.index({ estado: 1, cierraEn: 1 });
schema.index({ subjectId: 1, groupId: 1, estado: 1 });
// Una abierta por grupo y docente: dos clics seguidos en «Mostrar QR» ya no
// pueden crear dos sesiones con dos QR válidos que se pisan. Con el grupo en la
// clave, la lista de A194 que se quedó abierta no impide abrir la de A193.
schema.index(
  { subjectId: 1, groupId: 1, teacherId: 1 },
  { unique: true, partialFilterExpression: { estado: 'ABIERTA' }, name: 'una_abierta_por_grupo_y_docente' },
);

export const AttendanceSessionModel = model('SesionAsistencia', schema, 'sesiones_asistencia');

export type MotivoCierre = 'DOCENTE' | 'VENCIDA' | 'PERIODO';
