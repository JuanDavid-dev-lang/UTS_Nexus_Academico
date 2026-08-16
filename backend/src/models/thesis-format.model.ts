import { Schema, model } from 'mongoose';
import { baseFields } from './base.js';

/**
 * Formato oficial de trabajo de grado (F-DC-124, F-AM-04, …).
 *
 * El archivo físico vive en la carpeta `formatos/` del servidor — FUERA de
 * `uploads/`, que se sirve estática y sin autenticación. Un formato se
 * descarga solo por `GET /trabajos-grado/formatos/:id/archivo`, que exige ser
 * director (o administración).
 */
const schema = new Schema(
  {
    ...baseFields,
    /** Nombre visible: «F-DC-124 Propuesta de trabajo de grado». */
    nombre: { type: String, required: true, trim: true },
    descripcion: { type: String, default: '' },
    /** Etapa del trabajo de grado a la que pertenece; es el eje de la búsqueda. */
    etapa: {
      type: String,
      enum: ['PROPUESTA', 'DESARROLLO', 'INFORME_FINAL', 'EVALUACION', 'GRADO'],
      required: true,
      index: true,
    },
    /** Modalidades a las que aplica (práctica, investigación, monografía…). Vacío = todas. */
    modalidades: { type: [String], default: [] },
    /** Qué campos hay que diligenciar; guía visible antes de abrir el Word. */
    camposALlenar: { type: [String], default: [] },
    version: { type: String, default: '1' },
    archivo: {
      filename: { type: String, required: true },
      originalName: { type: String, required: true },
      mimetype: { type: String, required: true },
      size: { type: Number, required: true },
    },
    subidoPor: { type: Schema.Types.ObjectId, ref: 'Usuario', required: true },
  },
  { timestamps: true }
);

schema.index({ etapa: 1, nombre: 1 });

export const ThesisFormatModel = model('FormatoTrabajoGrado', schema, 'formatos_trabajo_grado');
