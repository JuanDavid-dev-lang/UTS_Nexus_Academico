import { Schema, model } from 'mongoose';

/**
 * Fotografía académica definitiva de un periodo cerrado.
 *
 * **Un documento por (estudiante, materia, periodo), no uno por periodo.** Un
 * único documento con el semestre entero dentro superaría los 16 MB de
 * MongoDB en cuanto la institución creciera, y el fallo llegaría el día del
 * cierre —el peor momento posible— en forma de un `BSONObjectTooLarge` que
 * nadie sabría interpretar. Repartido por registro, el cierre es reanudable y
 * el consolidado histórico se consulta con un `find` normal.
 *
 * Lo que se guarda ya viene calculado por `computeAcademicRecords()`: aquí no
 * se recalcula nada. La fotografía es una copia congelada de lo que la
 * pipeline canónica respondió en el instante del cierre.
 */
const schema = new Schema(
  {
    period: { type: String, required: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'Estudiante', required: true, index: true },
    subjectId: { type: Schema.Types.ObjectId, ref: 'Materia', required: true, index: true },
    groupId: { type: Schema.Types.ObjectId, ref: 'Grupo', default: null },
    teacherId: { type: Schema.Types.ObjectId, ref: 'Usuario', default: null, index: true },

    /** Identidad del estudiante en el momento del cierre (cambia con los años). */
    code: { type: String, default: '' },
    fullName: { type: String, default: '' },

    // ── Resultado académico congelado ────────────────────────────────────
    notaFinal: { type: Number, default: 0 },
    cortes: { type: [Number], default: [] },
    aprobado: { type: Boolean, default: false },
    notaCompleta: { type: Boolean, default: false },
    tieneNotas: { type: Boolean, default: false },

    asistenciaPorcentaje: { type: Number, default: 0 },
    clasesAusente: { type: Number, default: 0 },

    riesgoNivel: { type: String, enum: ['BAJO', 'MEDIO', 'ALTO'], default: 'BAJO' },
    riesgoPuntaje: { type: Number, default: 0 },
    riesgoMotivos: { type: [String], default: [] },

    /**
     * Versión del esquema de esta fotografía. Sube con cada reapertura y con
     * cada cambio de forma del documento; sin ella no hay forma de saber con
     * qué reglas se congeló un consolidado histórico.
     */
    snapshotVersion: { type: Number, default: 1, index: true },
    /** Instante exacto del cierre que produjo este registro. */
    capturedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

/**
 * Clave de idempotencia del cierre.
 *
 * El cierre se puede interrumpir y retomar; con este índice, retomarlo
 * reescribe el mismo documento en vez de duplicarlo. Sin él, un cierre que se
 * cae a la mitad y se relanza deja dos actas del mismo estudiante.
 */
schema.index({ period: 1, studentId: 1, subjectId: 1 }, { unique: true });

// La consulta natural del histórico: «el consolidado de esta materia aquel semestre».
schema.index({ period: 1, subjectId: 1 });

export const AcademicSnapshotModel = model(
  'FotografiaAcademica',
  schema,
  'fotografias_academicas',
);
