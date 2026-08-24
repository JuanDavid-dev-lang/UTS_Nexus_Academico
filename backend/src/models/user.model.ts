import { Schema, model } from 'mongoose';
import { baseFields } from './base.js';

const schema = new Schema(
  {
    ...baseFields,
    email: { type: String, required: true, unique: true, lowercase: true, index: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['ADMIN', 'PROFESSOR', 'COORDINATOR', 'STUDENT'], required: true },
    fullName: { type: String, required: true },
    /** Vínculo al registro Estudiante cuando role === 'STUDENT'. */
    studentId: { type: Schema.Types.ObjectId, ref: 'Estudiante', default: null, index: true },
    photoUrl: { type: String, default: null },
    lastLoginAt: { type: Date, default: null },
    passwordResetCodeHash: { type: String, default: null },
    passwordResetExpiresAt: { type: Date, default: null },
    passwordResetAttempts: { type: Number, default: 0 },
    passwordResetRequestedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export const UserModel = model('Usuario', schema, 'usuarios');
