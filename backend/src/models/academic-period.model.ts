import { Schema, model } from 'mongoose';
import { baseFields } from './base.js';

/**
 * Ciclo de vida de un periodo académico.
 *
 * Hasta ahora `period` era solo una cadena (`'2026-1'`) repartida por notas,
 * asistencia y matrículas: nadie sabía si un semestre seguía abierto. Este
 * documento es la única fuente de esa respuesta.
 *
 * Tres estados y no dos:
 *  - `OPEN`    — se escribe con normalidad.
 *  - `CLOSING` — el cierre está en marcha. Las escrituras académicas ya se
 *    rechazan, porque una nota guardada a mitad de la fotografía quedaría
 *    fuera de ella sin que nadie lo notara.
 *  - `CLOSED`  — cerrado. La fotografía está completa.
 *
 * `CLOSING` no es adorno: el cierre recorre miles de registros y puede tardar
 * o interrumpirse. Sin un estado intermedio, o se bloquea desde el principio
 * marcándolo como cerrado —y una interrupción deja un periodo cerrado con la
 * fotografía a medias— o no se bloquea nada y la fotografía miente.
 */
const schema = new Schema(
  {
    ...baseFields,
    /** Identificador del periodo, tal y como se guarda en el resto: `2026-1`. */
    period: { type: String, required: true, unique: true, index: true },
    /** Nombre legible opcional («Primer semestre 2026»). */
    label: { type: String, default: '' },
    state: {
      type: String,
      enum: ['OPEN', 'CLOSING', 'CLOSED'],
      default: 'OPEN',
      index: true,
    },

    // ── Trazabilidad del cierre ──────────────────────────────────────────
    closingStartedAt: { type: Date, default: null },
    closingStartedBy: { type: Schema.Types.ObjectId, ref: 'Usuario', default: null },
    closedAt: { type: Date, default: null },
    closedBy: { type: Schema.Types.ObjectId, ref: 'Usuario', default: null },

    /**
     * Progreso del cierre, para poder retomarlo y para que la pantalla de
     * administración muestre por dónde va sin inventarse el porcentaje.
     */
    progress: {
      total: { type: Number, default: 0 },
      done: { type: Number, default: 0 },
      /** Último error resumido; se limpia al terminar bien. */
      lastError: { type: String, default: null },
      updatedAt: { type: Date, default: null },
    },

    /**
     * Versión del esquema de la fotografía con la que se cerró.
     *
     * Sin ella, cambiar el contenido de un `AcademicSnapshot` dentro de un año
     * dejaría fotografías viejas y nuevas indistinguibles, y nadie podría
     * saber si un consolidado histórico se calculó con las reglas de entonces.
     */
    snapshotVersion: { type: Number, default: 0 },

    /** Resumen de la fotografía: lo que la pantalla muestra sin recorrerla. */
    snapshotSummary: {
      registros: { type: Number, default: 0 },
      estudiantes: { type: Number, default: 0 },
      materias: { type: Number, default: 0 },
      aprobados: { type: Number, default: 0 },
      reprobados: { type: Number, default: 0 },
      enRiesgoAlto: { type: Number, default: 0 },
      promedioGeneral: { type: Number, default: 0 },
    },

    /**
     * Historial de reaperturas. **Nunca se borra la fotografía anterior**: se
     * anota quién reabrió, cuándo y con qué motivo, y la versión sube. Una
     * reapertura silenciosa que sobrescribiera el consolidado oficial es
     * exactamente lo que un acta académica no puede permitir.
     */
    reopenings: [
      {
        _id: false,
        at: { type: Date, required: true },
        by: { type: Schema.Types.ObjectId, ref: 'Usuario', default: null },
        reason: { type: String, default: '' },
        /** Versión de la fotografía que quedó congelada al reabrir. */
        snapshotVersion: { type: Number, default: 0 },
      },
    ],
  },
  { timestamps: true },
);

export const AcademicPeriodModel = model('PeriodoAcademico', schema, 'periodos_academicos');

export type EstadoPeriodo = 'OPEN' | 'CLOSING' | 'CLOSED';
