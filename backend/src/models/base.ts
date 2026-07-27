import { Schema } from 'mongoose';

export const baseFields = {
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', index: true },
  status: { type: String, default: 'ACTIVE', index: true },
  deletedAt: { type: Date, default: null, index: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'Usuario', default: null },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'Usuario', default: null },
};

