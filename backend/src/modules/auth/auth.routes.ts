import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { UserModel } from '../../models/user.model.js';
import { SessionModel } from '../../models/session.model.js';
import { ProfessorModel } from '../../models/professor.model.js';
import { exigirSesion, identificar, requireRole } from '../../middlewares/auth.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../shared/jwt.js';
import { daysFromNow, hashToken } from '../../shared/security.js';
import { correoActivo, enviarCorreo } from '../../shared/mailer.js';
import { esProduccion } from '../../shared/env.js';
import type { Role } from '../../shared/types.js';
import crypto from 'node:crypto';

/**
 * Tope de longitud de contraseña.
 *
 * bcrypt solo mira los primeros 72 bytes, así que todo lo que pase de ahí no
 * añade seguridad: solo trabajo. Sin tope, `bcrypt.compare` con una cadena de
 * megabytes ocupa la CPU del proceso entero —Node es de un solo hilo— y basta
 * un puñado de peticiones de login para dejar la API sin responder a nadie.
 */
const MAX_PASSWORD = 128;

/** Contraseña de entrada: se acota antes de que llegue a bcrypt. */
const passwordEntrante = z.string().min(1).max(MAX_PASSWORD);

export const authRouter = Router();

const signPair = (user: { id: string; role: Role; tenantId?: string; studentId?: string }) => {
  const payload = { sub: user.id, role: user.role, tenantId: user.tenantId, studentId: user.studentId };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);
  return { accessToken, refreshToken };
};

/**
 * Alta de cuenta **por la administración**.
 *
 * Va detrás de `requireRole('ADMIN')` y no es negociable: acepta
 * `role: 'ADMIN'` y la ficha de docente nace `APROBADO`, así que abierta era
 * un generador público de administradores que además saltaba entero el diseño
 * de `/registro` —interruptor de la administración, estado `PENDIENTE` y
 * revisión humana—. Quien quiera darse de alta por su cuenta pasa por ahí.
 */
authRouter.post('/register', identificar, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const body = z.object({
      email: z.string().trim().toLowerCase().email().max(160),
      password: z.string().min(8).max(MAX_PASSWORD),
      fullName: z.string().trim().min(3).max(120),
      role: z.enum(['ADMIN', 'PROFESSOR', 'COORDINATOR']).default('PROFESSOR'),
      photoUrl: z.string().url().max(500).optional(),
      employeeCode: z.string().trim().max(40).optional(),
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
      email: z.string().trim().toLowerCase().email().max(160),
      password: passwordEntrante,
      device: z.string().trim().max(80).optional(),
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

/**
 * Renovación con **rotación** del refresh token (RTR).
 *
 * Cada canje quema el token usado y entrega uno nuevo sobre la misma sesión.
 * Antes se devolvía un par nuevo sin tocar la sesión: el token viejo seguía
 * siendo válido sus 30 días completos, así que uno filtrado —en un log, en un
 * backup del teléfono, en un portátil prestado— servía un mes entero aunque el
 * docente hubiera seguido usando la aplicación desde otro sitio.
 *
 * Reutilizar un token ya rotado es la firma de un robo: el ladrón y el dueño
 * no pueden canjear los dos. Ante esa señal se revoca **toda** la familia de
 * sesiones del usuario y ambos tienen que volver a entrar; es molesto una vez
 * y es lo único que corta el acceso del que copió el token.
 */
authRouter.post('/refresh', async (req, res, next) => {
  try {
    const body = z.object({ refreshToken: z.string().min(1).max(4096) }).parse(req.body);
    const payload = verifyRefreshToken(body.refreshToken);
    const tokenHash = hashToken(body.refreshToken);

    const session = await SessionModel.findOne({
      userId: payload.sub,
      refreshTokenHash: tokenHash,
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    });

    if (!session) {
      // ¿Existe pero ya estaba revocada? Entonces alguien está reutilizando un
      // token quemado y no se puede saber quién es el legítimo.
      const reutilizada = await SessionModel.exists({
        userId: payload.sub,
        refreshTokenHash: tokenHash,
      });
      if (reutilizada) {
        await SessionModel.updateMany(
          { userId: payload.sub, revokedAt: null },
          { $set: { revokedAt: new Date() } },
        );
        console.warn(`[auth] refresh token reutilizado por ${payload.sub}: sesiones revocadas.`);
      }
      return res.status(401).json({ ok: false, message: 'Invalid session' });
    }

    const user = await UserModel.findById(payload.sub);
    if (!user || user.deletedAt) {
      await SessionModel.updateOne({ _id: session._id }, { $set: { revokedAt: new Date() } });
      return res.status(401).json({ ok: false, message: 'Invalid session' });
    }

    const pair = signPair({
      id: user.id,
      role: user.role as Role,
      tenantId: user.tenantId?.toString(),
      studentId: user.studentId?.toString(),
    });

    // La sesión es la misma —no se crea una fila por renovación, que llenaba la
    // colección—: cambia el hash y se estira el vencimiento.
    session.refreshTokenHash = hashToken(pair.refreshToken);
    session.expiresAt = daysFromNow(30);
    await session.save();

    res.json({ ok: true, ...pair });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/logout', async (req, res, next) => {
  try {
    const body = z.object({ refreshToken: z.string().min(1).max(4096) }).parse(req.body);
    await SessionModel.updateMany(
      { refreshTokenHash: hashToken(body.refreshToken), revokedAt: null },
      { $set: { revokedAt: new Date() } }
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/**
 * Solicitud de código de recuperación.
 *
 * El código **no vuelve en la respuesta** salvo fuera de producción y sin
 * correo configurado. Devolverlo siempre convertía esta ruta en una toma de
 * cuenta de un solo paso: bastaba conocer un correo —el de cualquier docente,
 * que está en el directorio— para pedir el código, leerlo en la propia
 * respuesta y cambiar la contraseña. El canal de entrega tiene que ser distinto
 * del canal de petición; si no, no es un segundo factor de nada.
 *
 * La respuesta es idéntica exista o no la cuenta: distinguirlas convierte esto
 * en un comprobador de qué correos están registrados.
 */
authRouter.post('/recovery/request', async (req, res, next) => {
  try {
    const body = z.object({ email: z.string().trim().toLowerCase().email().max(160) }).parse(req.body);
    const respuestaNeutra = { ok: true, message: 'Si el correo existe, se enviará el código.' };

    const user = await UserModel.findOne({ email: body.email, deletedAt: null });
    if (!user) return res.json(respuestaNeutra);

    const code = String(crypto.randomInt(100000, 999999));
    user.passwordResetCodeHash = await bcrypt.hash(code, 10);
    user.passwordResetExpiresAt = daysFromNow(1 / 24);
    await user.save();

    const enviado = await enviarCorreo({
      para: [user.email],
      asunto: 'Código de recuperación · UTS Nexus Académico',
      texto:
        `Tu código para restablecer la contraseña es ${code}.\n\n` +
        'Caduca en una hora. Si no has pedido tú este cambio, ignora este mensaje: ' +
        'mientras no se use el código, tu contraseña sigue siendo la misma.',
    });

    // Sin SMTP y fuera de producción el código vuelve aquí: si no, en una
    // instalación local nadie podría recuperar una contraseña jamás. En
    // producción `validarProduccion()` ya no deja arrancar sin secretos, y
    // aquí tampoco se filtra aunque el correo esté apagado.
    if (!enviado && !esProduccion && !correoActivo()) {
      return res.json({ ...respuestaNeutra, devCode: code });
    }

    if (!enviado) {
      console.error(`[auth] no se pudo enviar el código de recuperación a ${user.email}.`);
    }
    res.json(respuestaNeutra);
  } catch (err) {
    next(err);
  }
});

authRouter.post('/recovery/reset', async (req, res, next) => {
  try {
    const body = z.object({
      email: z.string().trim().toLowerCase().email().max(160),
      code: z.string().trim().min(4).max(12),
      newPassword: z.string().min(8).max(MAX_PASSWORD),
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

authRouter.get('/me', identificar, exigirSesion, async (req, res) => {
  const user = await UserModel.findById(req.user!.id).lean();
  res.json({ ok: true, user });
});
