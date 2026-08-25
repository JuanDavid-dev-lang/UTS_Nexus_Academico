import { Schema, model } from 'mongoose';
import { baseFields } from './base.js';
import { ROLES } from '../shared/types.js';

const schema = new Schema(
  {
    ...baseFields,
    email: { type: String, required: true, unique: true, lowercase: true, index: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ROLES, required: true },
    fullName: { type: String, required: true },
    /** Vínculo al registro Estudiante cuando role === 'STUDENT'. */
    studentId: { type: Schema.Types.ObjectId, ref: 'Estudiante', default: null, index: true },
    photoUrl: { type: String, default: null },

    /**
     * Programas académicos a cargo. Solo significa algo para COORDINATOR y
     * SECRETARY: es lo que acota qué grupos, docentes y estudiantes ven.
     *
     * **Vacío = la institución entera.** Es lo que estas cuentas veían antes de
     * que existiera el alcance por programa, y cerrarlo a «nada» habría dejado
     * a las cuentas ya creadas mirando pantallas vacías tras actualizar, sin un
     * error que lo explicara. Se restringe asignando programas desde
     * `PATCH /usuarios/:id`, que queda en la auditoría.
     *
     * Guarda ids del catálogo (`domains/catalog/uts.ts`), nunca nombres: el
     * nombre visible de un programa cambia y el id no.
     */
    programas: { type: [String], default: [], index: true },
    /** Sede y facultad de adscripción. Informativas: no acotan por sí solas. */
    sede: { type: String, default: null },
    facultad: { type: String, default: null },

    lastLoginAt: { type: Date, default: null },
    passwordResetCodeHash: { type: String, default: null },
    passwordResetExpiresAt: { type: Date, default: null },
    passwordResetAttempts: { type: Number, default: 0 },
    passwordResetRequestedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export const UserModel = model('Usuario', schema, 'usuarios');
