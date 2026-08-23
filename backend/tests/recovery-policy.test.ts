import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findOneAndUpdate: vi.fn(), findOne: vi.fn(), updateOne: vi.fn(), updateMany: vi.fn(),
  sendMail: vi.fn(), mailEnabled: vi.fn(), startSession: vi.fn(), compare: vi.fn(), hash: vi.fn(),
}));
vi.mock('../src/models/user.model.js', () => ({ UserModel: { findOneAndUpdate: mocks.findOneAndUpdate, findOne: mocks.findOne, updateOne: mocks.updateOne } }));
vi.mock('../src/models/session.model.js', () => ({ SessionModel: { updateMany: mocks.updateMany } }));
vi.mock('../src/shared/mailer.js', () => ({ enviarCorreo: mocks.sendMail, correoActivo: mocks.mailEnabled }));
vi.mock('../src/shared/env.js', () => ({ esProduccion: false }));
vi.mock('bcryptjs', () => ({ default: { hash: mocks.hash, compare: mocks.compare } }));
vi.mock('mongoose', () => ({ default: { startSession: mocks.startSession } }));

import { MAX_ATTEMPTS, requestPasswordReset, resetPassword } from '../src/modules/auth/recovery.service.js';

describe('recuperación de contraseña', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hash.mockImplementation(async (value: string) => `hash:${value}`);
    mocks.compare.mockResolvedValue(true);
    mocks.updateOne.mockResolvedValue({ modifiedCount: 1 });
    mocks.updateMany.mockResolvedValue({ modifiedCount: 2 });
    mocks.mailEnabled.mockReturnValue(true);
    mocks.sendMail.mockResolvedValue(true);
    mocks.startSession.mockResolvedValue({ withTransaction: async (work: () => Promise<void>) => work(), endSession: vi.fn() });
  });

  it('responde neutralmente cuando la cuenta no existe o está en cooldown', async () => {
    mocks.findOneAndUpdate.mockResolvedValue(null);
    await expect(requestPasswordReset('nadie@uts.edu.co')).resolves.toEqual({});
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  it('entrega devCode y conserva el código solo en desarrollo sin SMTP', async () => {
    mocks.findOneAndUpdate.mockResolvedValue({ _id: 'u1', email: 'dev@uts.edu.co' });
    mocks.mailEnabled.mockReturnValue(false); mocks.sendMail.mockResolvedValue(false);
    const result = await requestPasswordReset('dev@uts.edu.co');
    expect(result.devCode).toMatch(/^\d{6}$/);
    expect(mocks.updateOne).not.toHaveBeenCalled();
  });

  it('revierte la reserva si SMTP falla para permitir un reintento', async () => {
    mocks.findOneAndUpdate.mockResolvedValue({ _id: 'u1', email: 'persona@uts.edu.co' });
    mocks.sendMail.mockResolvedValue(false);
    await expect(requestPasswordReset('persona@uts.edu.co')).resolves.toEqual({});
    expect(mocks.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({ _id: 'u1', passwordResetCodeHash: expect.any(String) }),
      { $set: expect.objectContaining({ passwordResetRequestedAt: null, passwordResetCodeHash: null }) },
    );
  });

  it('rechaza códigos vencidos o bloqueados sin comparar hashes', async () => {
    mocks.findOne.mockReturnValue({ select: vi.fn().mockResolvedValue(null) });
    await expect(resetPassword({ email: 'a@uts.edu.co', code: '123456', newPassword: 'segura123' })).resolves.toBe(false);
    expect(mocks.compare).not.toHaveBeenCalled();
  });

  it('cuenta un intento inválido solo contra el código leído', async () => {
    mocks.findOne.mockReturnValue({ select: vi.fn().mockResolvedValue({ _id: 'u1', passwordResetCodeHash: 'actual' }) });
    mocks.compare.mockResolvedValue(false);
    await expect(resetPassword({ email: 'a@uts.edu.co', code: '000000', newPassword: 'segura123' })).resolves.toBe(false);
    expect(mocks.updateOne).toHaveBeenCalledWith(
      { _id: 'u1', passwordResetCodeHash: 'actual', passwordResetAttempts: { $lt: MAX_ATTEMPTS } },
      { $inc: { passwordResetAttempts: 1 } },
    );
  });

  it('cambia la contraseña, consume el código y revoca sesiones en una transacción', async () => {
    mocks.findOne.mockReturnValue({ select: vi.fn().mockResolvedValue({ _id: 'u1', passwordResetCodeHash: 'actual' }) });
    mocks.findOneAndUpdate.mockResolvedValue({ _id: 'u1' });
    await expect(resetPassword({ email: 'a@uts.edu.co', code: '123456', newPassword: 'segura123' })).resolves.toBe(true);
    expect(mocks.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ _id: 'u1', passwordResetCodeHash: 'actual' }),
      expect.objectContaining({ $unset: expect.objectContaining({ passwordResetCodeHash: 1 }) }),
      expect.objectContaining({ session: expect.anything() }),
    );
    expect(mocks.updateMany).toHaveBeenCalledWith(
      { userId: 'u1', revokedAt: null }, { $set: { revokedAt: expect.any(Date) } }, { session: expect.anything() },
    );
  });

  it('no confirma el cambio si otro intento ya consumió el código', async () => {
    mocks.findOne.mockReturnValue({ select: vi.fn().mockResolvedValue({ _id: 'u1', passwordResetCodeHash: 'actual' }) });
    mocks.findOneAndUpdate.mockResolvedValue(null);
    await expect(resetPassword({ email: 'a@uts.edu.co', code: '123456', newPassword: 'segura123' })).resolves.toBe(false);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it('propaga el fallo de revocación para que la transacción deshaga el cambio', async () => {
    const endSession = vi.fn();
    mocks.findOne.mockReturnValue({ select: vi.fn().mockResolvedValue({ _id: 'u1', passwordResetCodeHash: 'actual' }) });
    mocks.findOneAndUpdate.mockResolvedValue({ _id: 'u1' });
    mocks.updateMany.mockRejectedValue(new Error('falló la revocación'));
    mocks.startSession.mockResolvedValue({
      withTransaction: async (work: () => Promise<void>) => work(),
      endSession,
    });

    await expect(resetPassword({ email: 'a@uts.edu.co', code: '123456', newPassword: 'segura123' }))
      .rejects.toThrow('falló la revocación');
    expect(endSession).toHaveBeenCalled();
  });
});
