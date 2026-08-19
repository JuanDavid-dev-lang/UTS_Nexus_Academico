import { Schema, model } from 'mongoose';
import { baseFields } from './base.js';

const { status: _ignoredStatus, ...activityBase } = baseFields;

/**
 * Actividad académica: un taller, una entrega, un parcial con fecha límite.
 *
 * **`LATE` no se persiste.** Es una condición del reloj —«sigue abierta y la
 * fecha ya pasó»—, no una decisión de nadie, y guardarla obligaría a un
 * proceso que recorriera todas las actividades cada minuto para ponerla al
 * día. Cualquier fallo de ese proceso dejaría actividades vencidas
 * presentándose como abiertas, que es exactamente el estado desactualizado en
 * silencio que hay que evitar. Lo que se guarda es `OPEN` o `CLOSED`; el
 * servicio deriva `LATE` al leer, comparando `dueAt` con el instante actual.
 *
 * El `enum` conserva `LATE` únicamente por compatibilidad: los documentos
 * creados antes de esta decisión pueden tenerlo escrito, y rechazarlos al
 * leer rompería listados existentes.
 */
const schema = new Schema(
  {
    ...activityBase,
    title: { type: String, required: true },
    description: { type: String, default: '' },
    subjectId: { type: Schema.Types.ObjectId, ref: 'Materia', required: true, index: true },
    groupId: { type: Schema.Types.ObjectId, ref: 'Grupo', default: null, index: true },
    teacherId: { type: Schema.Types.ObjectId, ref: 'Usuario', required: true, index: true },
    /** Periodo al que pertenece. Lo necesita el cierre y el filtrado por semestre. */
    period: { type: String, default: '', index: true },
    dueAt: { type: Date, required: true, index: true },
    weight: { type: Number, default: 0 },
    attachmentUrl: { type: String, default: null },
    status: { type: String, enum: ['OPEN', 'CLOSED', 'LATE'], default: 'OPEN', index: true },

    // ── Trazabilidad del cierre y la reapertura ──────────────────────────
    closedAt: { type: Date, default: null },
    closedBy: { type: Schema.Types.ObjectId, ref: 'Usuario', default: null },
    reopenedAt: { type: Date, default: null },
    reopenedBy: { type: Schema.Types.ObjectId, ref: 'Usuario', default: null },
  },
  { timestamps: true }
);

// El listado natural: las de este docente en este periodo, por fecha límite.
schema.index({ teacherId: 1, period: 1, dueAt: -1 });
// El escáner de vencimientos mira solo lo abierto dentro de una ventana.
schema.index({ status: 1, dueAt: 1, deletedAt: 1 });

export const ActivityModel = model('Actividad', schema, 'actividades');
