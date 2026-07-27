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

export const AuditModel = model('Auditoria', schema, 'auditoria');

