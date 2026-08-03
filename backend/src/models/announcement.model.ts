import { Schema, model } from 'mongoose';
import { baseFields } from './base.js';

/**
 * Aviso institucional dirigido a los docentes.
 *
 * Lo publica la administración; el docente solo lee. Es deliberadamente
 * distinto de `Notificacion`: aquella la genera el sistema por un hecho
 * académico —un estudiante entra en riesgo— y muere cuando se atiende. Un aviso
 * lo escribe una persona, va dirigido a un colectivo y sigue siendo válido
 * aunque nadie lo haya abierto. Mezclarlos habría hecho que un cambio de fechas
 * de entrega desapareciera de la lista al marcarlo como leído.
 */
const schema = new Schema(
  {
    ...baseFields,
    titulo: { type: String, required: true, trim: true },
    cuerpo: { type: String, required: true },
    /** Cómo se presenta. El color nunca va solo: cada tipo lleva su etiqueta. */
    tipo: {
      type: String,
      enum: ['INFORMATIVO', 'IMPORTANTE', 'URGENTE'],
      default: 'INFORMATIVO',
      index: true,
    },
    /** Quién lo publicó. Un aviso sin autor identificable no es confiable. */
    autorId: { type: Schema.Types.ObjectId, ref: 'Usuario', required: true, index: true },

    // ── Alcance ────────────────────────────────────────────────────────────
    // Vacío significa "toda la institución". Cuanto más se rellena, más se
    // acota: sede + facultad + programa se combinan con Y, no con O.
    sedes: { type: [String], default: [] },
    facultades: { type: [String], default: [] },
    programas: { type: [String], default: [] },

    /** Desde cuándo se muestra. Permite dejarlo escrito y que aparezca solo. */
    publicadoEn: { type: Date, default: Date.now, index: true },
    /** Cuándo deja de mostrarse. `null` = no caduca. */
    expiraEn: { type: Date, default: null, index: true },

    /** Docentes que ya lo abrieron. Sirve para el contador de no leídos. */
    leidoPor: [{ type: Schema.Types.ObjectId, ref: 'Usuario' }],

    /** Fijado arriba del listado, por encima de la fecha. */
    fijado: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// El listado siempre se ordena igual: primero lo fijado, después lo más reciente.
schema.index({ fijado: -1, publicadoEn: -1 });

export const AnnouncementModel = model('Aviso', schema, 'avisos');
