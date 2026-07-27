import { Schema, model } from 'mongoose';
import { baseFields } from './base.js';

const { status: _ignoredStatus, ...activityBase } = baseFields;

const schema = new Schema(
  {
    ...activityBase,
    title: { type: String, required: true },
    description: { type: String, default: '' },
    subjectId: { type: Schema.Types.ObjectId, ref: 'Materia', required: true, index: true },
    groupId: { type: Schema.Types.ObjectId, ref: 'Grupo', default: null, index: true },
    teacherId: { type: Schema.Types.ObjectId, ref: 'Usuario', required: true, index: true },
    dueAt: { type: Date, required: true, index: true },
    weight: { type: Number, default: 0 },
    attachmentUrl: { type: String, default: null },
    status: { type: String, enum: ['OPEN', 'CLOSED', 'LATE'], default: 'OPEN', index: true },
  },
  { timestamps: true }
);

export const ActivityModel = model('Actividad', schema, 'actividades');
