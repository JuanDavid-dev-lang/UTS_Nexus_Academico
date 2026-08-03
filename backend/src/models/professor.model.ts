import { Schema, model } from 'mongoose';
import { baseFields } from './base.js';

const schema = new Schema(
  {
    ...baseFields,
    userId: { type: Schema.Types.ObjectId, ref: 'Usuario', required: true, unique: true, index: true },
    employeeCode: { type: String, default: null, index: true },
    department: { type: String, default: 'UTS' },
    title: { type: String, default: 'Docente' },
    photoUrl: { type: String, default: null },
    signatureUrl: { type: String, default: null },

    // ── Datos del registro ─────────────────────────────────────────────────
    /** Cédula. Identifica a la persona ante la institución. */
    cedula: { type: String, default: null, index: true },
    nombres: { type: String, default: '' },
    apellidos: { type: String, default: '' },
    sede: { type: String, default: null, index: true },
    facultad: { type: String, default: null, index: true },
    /** Uno o los dos: TECNOLOGICO, PROFESIONAL. */
    niveles: { type: [String], default: [] },
    /** Ids del catálogo en `domains/catalog/uts.ts`. */
    programas: { type: [String], default: [] },

    /**
     * Estado de la cuenta cuando llega por autorregistro.
     *
     * `PENDIENTE` mientras la administración no lo aprueba. No es burocracia:
     * un docente puede buscar en el directorio global de estudiantes para
     * matricular, así que una cuenta de docente sin revisar sería acceso a la
     * identidad de cualquier estudiante. Las cuentas creadas por un
     * administrador nacen `APROBADO`.
     */
    estado: {
      type: String,
      enum: ['PENDIENTE', 'APROBADO', 'RECHAZADO'],
      default: 'APROBADO',
      index: true,
    },
    revisadoPor: { type: Schema.Types.ObjectId, ref: 'Usuario', default: null },
    revisadoEn: { type: Date, default: null },
    motivoRechazo: { type: String, default: '' },
  },
  { timestamps: true }
);

export const ProfessorModel = model('Profesor', schema, 'profesores');

