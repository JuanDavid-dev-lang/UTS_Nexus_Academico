import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { UserModel } from '../../models/user.model.js';
import { SessionModel } from '../../models/session.model.js';
import { correoActivo, enviarCorreo } from '../../shared/mailer.js';
import { esProduccion } from '../../shared/env.js';
import mongoose from 'mongoose';

export const CODE_TTL_MS = 60 * 60 * 1000;
export const REQUEST_COOLDOWN_MS = 60 * 1000;
export const MAX_ATTEMPTS = 5;

export const RECOVERY_PUBLIC_MESSAGE = 'Si el correo existe, se enviará el código.';
export const RECOVERY_INVALID_MESSAGE = 'El código no es válido o ya venció.';

export async function requestPasswordReset(email: string): Promise<{ devCode?: string }> {
  const now = new Date();
  const code = String(crypto.randomInt(100000, 1000000));
  const codeHash = await bcrypt.hash(code, 10);

  // La condición hace atómico el cooldown por cuenta. La respuesta pública no
  // cambia si la cuenta no existe o si todavía está dentro del cooldown.
  const user = await UserModel.findOneAndUpdate(
    {
      email,
      deletedAt: null,
      $or: [
        { passwordResetRequestedAt: null },
        { passwordResetRequestedAt: { $lte: new Date(now.getTime() - REQUEST_COOLDOWN_MS) } },
      ],
    },
    {
      $set: {
        passwordResetCodeHash: codeHash,
        passwordResetExpiresAt: new Date(now.getTime() + CODE_TTL_MS),
        passwordResetRequestedAt: now,
        passwordResetAttempts: 0,
        passwordResetLockedUntil: null,
      },
    },
    { new: true },
  );

  if (!user) return {};

  const sent = await enviarCorreo({
    para: [user.email],
    asunto: 'Código de recuperación · UTS Nexus Académico',
    texto:
      `Tu código para restablecer la contraseña es ${code}.\n\n` +
      'Caduca en una hora. Si no has pedido tú este cambio, ignora este mensaje.',
  });

  if (!sent && !esProduccion && !correoActivo()) return { devCode: code };
  if (!sent) {
    // El hash se reservó antes de llamar al proveedor para que dos solicitudes
    // concurrentes no puedan saltarse el cooldown. Si la entrega falla, se
    // revierte únicamente esa reserva: no queda un código imposible de conocer
    // y una nueva petición puede reintentar de inmediato.
    await UserModel.updateOne(
      { _id: user._id, passwordResetCodeHash: codeHash, passwordResetRequestedAt: now },
      {
        $set: {
          passwordResetCodeHash: null,
          passwordResetExpiresAt: null,
          passwordResetRequestedAt: null,
          passwordResetAttempts: 0,
          passwordResetLockedUntil: null,
        },
      },
    );
    console.error(`[auth] no se pudo enviar el código de recuperación a ${user.email}.`);
  }
  return {};
}

export async function resetPassword(input: {
  email: string;
  code: string;
  newPassword: string;
}): Promise<boolean> {
  const now = new Date();
  const user = await UserModel.findOne({
    email: input.email,
    deletedAt: null,
    passwordResetCodeHash: { $ne: null },
    passwordResetExpiresAt: { $gt: now },
    passwordResetAttempts: { $lt: MAX_ATTEMPTS },
    $or: [{ passwordResetLockedUntil: null }, { passwordResetLockedUntil: { $lte: now } }],
  }).select('_id passwordResetCodeHash');

  if (!user?.passwordResetCodeHash) return false;
  const codeHash = user.passwordResetCodeHash;
  const matches = await bcrypt.compare(input.code, codeHash);

  if (!matches) {
    // Solo incrementa el intento del código leído. Si entretanto se pidió uno
    // nuevo, este fallo no consume intentos del código nuevo.
    await UserModel.updateOne(
      { _id: user._id, passwordResetCodeHash: codeHash, passwordResetAttempts: { $lt: MAX_ATTEMPTS } },
      { $inc: { passwordResetAttempts: 1 } },
    );
    return false;
  }

  const passwordHash = await bcrypt.hash(input.newPassword, 12);
  // Una sola petición puede consumir el código: el hash forma parte de la
  // condición y se elimina en la misma escritura que cambia la contraseña.
  const session = await mongoose.startSession();
  try {
    let changed = false;
    await session.withTransaction(async () => {
      const consumed = await UserModel.findOneAndUpdate(
        {
          _id: user._id,
          passwordResetCodeHash: codeHash,
          passwordResetExpiresAt: { $gt: new Date() },
          passwordResetAttempts: { $lt: MAX_ATTEMPTS },
        },
        {
          $set: { passwordHash },
          $unset: {
            passwordResetCodeHash: 1,
            passwordResetExpiresAt: 1,
            passwordResetAttempts: 1,
            passwordResetLockedUntil: 1,
          },
        },
        { session },
      );
      if (!consumed) return;

      await SessionModel.updateMany(
        { userId: user._id, revokedAt: null },
        { $set: { revokedAt: new Date() } },
        { session },
      );
      changed = true;
    });
    return changed;
  } finally {
    await session.endSession();
  }
}
