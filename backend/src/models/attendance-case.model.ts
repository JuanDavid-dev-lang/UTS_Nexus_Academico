import { Schema, model } from 'mongoose';
import { baseFields } from './base.js';

/**
 * Caso de seguimiento abierto por un patrón de inasistencia.
 *
 * No es una notificación: la notificación se lee y desaparece, el caso queda.
 * Un estudiante que falta tres clases seguidas, aparece la cuarta y vuelve a
 * faltar la quinta no genera tres casos; genera uno que se actualiza. Por eso
 * la clave única es (estudiante, materia, periodo, patrón) y no incluye la
 * fecha: el hecho seguido es «este estudiante tiene este problema en esta
 * materia», no «faltó el martes».
 *
 * **La desaparición temporal del patrón no borra el caso.** Se marca
 * `RESUELTO` con su fecha, y el historial del estudiante lo sigue mostrando.
 * Borrarlo dejaría al docente sin memoria de lo que ya había atendido.
 */
const schema = new Schema(
  {
    ...baseFields,
    studentId: { type: Schema.Types.ObjectId, ref: 'Estudiante', required: true, index: true },
    subjectId: { type: Schema.Types.ObjectId, ref: 'Materia', required: true, index: true },
    groupId: { type: Schema.Types.ObjectId, ref: 'Grupo', default: null },
    teacherId: { type: Schema.Types.ObjectId, ref: 'Usuario', default: null, index: true },
    period: { type: String, required: true, index: true },

    /** Identificador del patrón detectado; el catálogo vive en `domains/attendance/patterns.ts`. */
    pattern: {
      type: String,
      enum: [
        'AUSENCIAS_CONSECUTIVAS_2',
        'AUSENCIAS_CONSECUTIVAS_3',
        'TARDANZAS_REPETIDAS',
        'CAIDA_RECIENTE',
        'ASISTENCIA_PARCIAL_REPETIDA',
      ],
      required: true,
      index: true,
    },
    severity: { type: String, enum: ['BAJA', 'MEDIA', 'ALTA'], default: 'MEDIA', index: true },

    /** Resumen legible de la evidencia; lo redacta el dominio puro. */
    evidence: { type: String, default: '' },
    /** Datos mínimos que sustentan la evidencia (fechas, contadores). */
    evidenceData: { type: Object, default: {} },

    detectedAt: { type: Date, default: Date.now, index: true },
    /** Última pasada del escáner que volvió a ver el patrón. */
    lastSeenAt: { type: Date, default: Date.now },
    /** Cuántas pasadas lo han confirmado. Distingue un tropiezo de una tendencia. */
    occurrences: { type: Number, default: 1 },

    status: {
      type: String,
      enum: ['ABIERTO', 'EN_SEGUIMIENTO', 'RESUELTO', 'DESCARTADO'],
      default: 'ABIERTO',
      index: true,
    },
    /** Nota de la intervención del docente. */
    interventionNote: { type: String, default: '' },
    interventionAt: { type: Date, default: null },
    interventionBy: { type: Schema.Types.ObjectId, ref: 'Usuario', default: null },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// Un caso por hecho seguido: reabrir el mismo patrón actualiza, no duplica.
schema.index({ studentId: 1, subjectId: 1, period: 1, pattern: 1 }, { unique: true });
// El listado natural: lo abierto de este docente, lo más grave primero.
schema.index({ teacherId: 1, status: 1, detectedAt: -1 });

export const AttendanceCaseModel = model('CasoAsistencia', schema, 'casos_asistencia');
