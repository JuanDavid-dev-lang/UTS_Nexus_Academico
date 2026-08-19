import { Schema, model } from 'mongoose';

const schema = new Schema(
  {
    actorId: { type: Schema.Types.ObjectId, ref: 'Usuario', default: null, index: true },
    action: { type: String, required: true, index: true },
    entity: { type: String, required: true, index: true },
    entityId: { type: Schema.Types.ObjectId, default: null, index: true },
    before: { type: Object, default: null },
    after: { type: Object, default: null },
    ip: { type: String, default: null },
    userAgent: { type: String, default: null },
  },
  { timestamps: true }
);

/**
 * Índices del panel de consulta.
 *
 * La colección de auditoría solo crece y nunca se borra; sin un índice por
 * fecha, la primera página del panel obliga a un recorrido completo, y eso se
 * nota a los pocos meses de uso. Los compuestos cubren los dos filtros que se
 * usan de verdad —«qué hizo esta persona» y «qué le pasó a este documento»—
 * manteniendo el orden descendente que la tabla necesita.
 */
schema.index({ createdAt: -1 });
schema.index({ actorId: 1, createdAt: -1 });
schema.index({ entity: 1, createdAt: -1 });
schema.index({ entityId: 1, createdAt: -1 });

export const AuditModel = model('Auditoria', schema, 'auditoria');

