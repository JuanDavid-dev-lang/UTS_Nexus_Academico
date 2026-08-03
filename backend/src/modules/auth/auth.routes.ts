import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { UserModel } from '../../models/user.model.js';
import { SessionModel } from '../../models/session.model.js';
import { ProfessorModel } from '../../models/professor.model.js';
import { auth } from '../../middlewares/auth.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../shared/jwt.js';
import { daysFromNow, hashToken } from '../../shared/security.js';
import type { Role } from '../../shared/types.js';
import crypto from 'node:crypto';

export const authRouter = Router();

const signPair = (user: { id: string; role: Role; tenantId?: string; studentId?: string }) => {
  const payload = { sub: user.id, role: user.role, tenantId: user.tenantId, studentId: user.studentId };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);
  return { accessToken, refreshToken };
};

authRouter.post('/register', async (req, res, next) => {
  try {
    const body = z.object({
      email: z.string().email(),
      password: z.string().min(8),
      fullName: z.string().min(3),
      role: z.enum(['ADMIN', 'PROFESSOR', 'COORDINATOR']).default('PROFESSOR'),
      photoUrl: z.string().url().optional(),
      employeeCode: z.string().optional(),
    }).parse(req.body);

    const exists = await UserModel.findOne({ email: body.email });
    if (exists) return res.status(409).json({ ok: false, message: 'Email already in use' });

    const passwordHash = await bcrypt.hash(body.password, 12);
    const user = await UserModel.create({
      email: body.email,
      passwordHash,
      role: body.role,
      fullName: body.fullName,
      photoUrl: body.photoUrl ?? null,
    });

    if (body.role === 'PROFESSOR') {
      await ProfessorModel.create({
        userId: user.id,
        employeeCode: body.employeeCode ?? null,
        photoUrl: body.photoUrl ?? null,
      });
    }

    const { accessToken, refreshToken } = signPair({ id: user.id, role: user.role, tenantId: user.tenantId?.toString() });
    await SessionModel.create({
      userId: user.id,
      refreshTokenHash: hashToken(refreshToken),
      expiresAt: daysFromNow(30),
    });

    res.status(201).json({
      ok: true,
      accessToken,
      refreshToken,
      user: { id: user.id, email: user.email, role: user.role, fullName: user.fullName, photoUrl: user.photoUrl },
    });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/login', async (req, res, next) => {
  try {
    const body = z.object({
      email: z.string().email(),
      password: z.string().min(1),
      device: z.string().optional(),
    }).parse(req.body);

    const user = await UserModel.findOne({ email: body.email, deletedAt: null });
    if (!user) return res.status(401).json({ ok: false, message: 'Invalid credentials' });

    const ok = await bcrypt.compare(body.password, user.passwordHash);
    if (!ok) return res.status(401).json({ ok: false, message: 'Invalid credentials' });

    // Una cuenta llegada por autorregistro no abre nada hasta que se revisa.
    // La comprobación va aquí, después de validar la contraseña: hacerlo antes
    // permitiría averiguar qué correos están registrados probando cualquiera.
    if (user.role === 'PROFESSOR') {
      const ficha = await ProfessorModel.findOne({ userId: user._id, deletedAt: null })
        .select('estado motivoRechazo')
        .lean();

      if (ficha?.estado === 'PENDIENTE') {
        return res.status(403).json({
          ok: false,
          estado: 'PENDIENTE',
          message: 'Tu registro está en revisión. Te avisaremos cuando lo aprueben.',
        });
      }
      if (ficha?.estado === 'RECHAZADO') {
        return res.status(403).json({
          ok: false,
          estado: 'RECHAZADO',
          message: ficha.motivoRechazo
            ? `Tu registro fue rechazado: ${ficha.motivoRechazo}`
            : 'Tu registro fue rechazado. Contacta con la administración.',
        });
      }
    }

    user.lastLoginAt = new Date();
    await user.save();

    const { accessToken, refreshToken } = signPair({
      id: user.id,
      role: user.role as Role,
      tenantId: user.tenantId?.toString(),
      studentId: user.studentId?.toString(),
    });

    await SessionModel.create({
      userId: user.id,
      refreshTokenHash: hashToken(refreshToken),
      expiresAt: daysFromNow(30),
      device: body.device ?? 'web',
    });

    res.json({
      ok: true,
      accessToken,
      refreshToken,
      user: { id: user.id, email: user.email, role: user.role, fullName: user.fullName, photoUrl: user.photoUrl },
    });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/refresh', async (req, res, next) => {
  try {
    const body = z.object({ refreshToken: z.string().min(1) }).parse(req.body);
    const payload = verifyRefreshToken(body.refreshToken);
    const session = await SessionModel.findOne({
      userId: payload.sub,
      refreshTokenHash: hashToken(body.refreshToken),
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    });
    if (!session) return res.status(401).json({ ok: false, message: 'Invalid session' });

    const user = await UserModel.findById(payload.sub);
    if (!user) return res.status(401).json({ ok: false, message: 'Invalid session' });

    const pair = signPair({
      id: user.id,
      role: user.role as Role,
      tenantId: user.tenantId?.toString(),
      studentId: user.studentId?.toString(),
    });
    res.json({ ok: true, ...pair });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/logout', async (req, res, next) => {
  try {
    const body = z.object({ refreshToken: z.string().min(1) }).parse(req.body);
    await SessionModel.updateMany(
      { refreshTokenHash: hashToken(body.refreshToken), revokedAt: null },
      { $set: { revokedAt: new Date() } }
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/recovery/request', async (req, res, next) => {
  try {
    const body = z.object({ email: z.string().email() }).parse(req.body);
    const user = await UserModel.findOne({ email: body.email, deletedAt: null });
    if (!user) return res.json({ ok: true, message: 'Si el correo existe, se enviará el código.' });

    const code = String(crypto.randomInt(100000, 999999));
    user.passwordResetCodeHash = await bcrypt.hash(code, 10);
    user.passwordResetExpiresAt = daysFromNow(1 / 24);
    await user.save();

    res.json({
      ok: true,
      message: 'Código generado para recuperación.',
      devCode: code,
    });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/recovery/reset', async (req, res, next) => {
  try {
    const body = z.object({
      email: z.string().email(),
      code: z.string().min(4),
      newPassword: z.string().min(8),
    }).parse(req.body);

    const user = await UserModel.findOne({ email: body.email, deletedAt: null });
    if (!user || !user.passwordResetCodeHash || !user.passwordResetExpiresAt) {
      return res.status(400).json({ ok: false, message: 'Recovery not available' });
    }

    if (user.passwordResetExpiresAt.getTime() < Date.now()) {
      return res.status(400).json({ ok: false, message: 'Code expired' });
    }

    const ok = await bcrypt.compare(body.code, user.passwordResetCodeHash);
    if (!ok) return res.status(400).json({ ok: false, message: 'Invalid code' });

    user.passwordHash = await bcrypt.hash(body.newPassword, 12);
    user.passwordResetCodeHash = null;
    user.passwordResetExpiresAt = null;
    await user.save();
    await SessionModel.updateMany({ userId: user.id }, { $set: { revokedAt: new Date() } });

    res.json({ ok: true, message: 'Password updated' });
  } catch (err) {
    next(err);
  }
});

authRouter.get('/me', auth, async (req, res) => {
  if (!req.user) return res.status(401).json({ ok: false, message: 'Unauthorized' });
  const user = await UserModel.findById(req.user.id).lean();
  res.json({ ok: true, user });
});
