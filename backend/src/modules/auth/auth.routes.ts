import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { UserModel } from '../../models/user.model.js';
import { SessionModel } from '../../models/session.model.js';
import { ProfessorModel } from '../../models/professor.model.js';
import { exigirSesion, identificar, requireRole } from '../../middlewares/auth.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../shared/jwt.js';
import { daysFromNow, hashToken } from '../../shared/security.js';
import type { Role } from '../../shared/types.js';
import rateLimit from 'express-rate-limit';
import { passwordEntrante, passwordNueva } from '../../shared/validation.js';
import {
  RECOVERY_INVALID_MESSAGE,
  RECOVERY_PUBLIC_MESSAGE,
  requestPasswordReset,
  resetPassword,
} from './recovery.service.js';

// `MAX_PASSWORD`, `passwordEntrante` y `passwordNueva` viven en
// `shared/validation.js`: la política de una contraseña nueva la fijan tres
// puertas distintas y tenerla escrita en cada una dejaba a la recuperación con
// la más floja de las tres.

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
      // Misma política que el autorregistro: un alta hecha por la
      // administración no tiene por qué admitir una contraseña más débil.
      password: passwordNueva,
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

    const user = await UserModel.findById(payload.sub);
    if (!user || user.deletedAt) {
      // Cierra por si acaso la sesión que ese token identifica, sin filtrar
      // si existía: la respuesta es la misma tanto si el usuario no existe
      // como si la sesión ya no era válida.
      await SessionModel.updateMany(
        { userId: payload.sub, refreshTokenHash: tokenHash, revokedAt: null },
        { $set: { revokedAt: new Date() } },
      );
      return res.status(401).json({ ok: false, message: 'Invalid session' });
    }

    if (user.role === 'PROFESSOR') {
      const ficha = await ProfessorModel.findOne({ userId: user._id, deletedAt: null })
        .select('estado')
        .lean();
      if (ficha?.estado && ficha.estado !== 'APROBADO') {
        await SessionModel.updateMany(
          { userId: user._id, revokedAt: null },
          { $set: { revokedAt: new Date() } },
        );
        return res.status(401).json({ ok: false, message: 'Invalid session' });
      }
    }

    const pair = signPair({
      id: user.id,
      role: user.role as Role,
      tenantId: user.tenantId?.toString(),
      studentId: user.studentId?.toString(),
    });

    /**
     * Rotación atómica: la comprobación y la escritura son una sola
     * operación de Mongo, no un `findOne` seguido de `session.save()`.
     *
     * Con lectura y escritura separadas, dos renovaciones concurrentes con
     * el mismo token —un reintento de red del móvil, dos pestañas— podían
     * pasar las dos la lectura antes de que ninguna hubiera escrito. Las dos
     * firmaban un par válido, pero solo el de la que guardara al final
     * quedaba coincidiendo con lo almacenado: la otra recibía un par de
     * tokens que parecía correcto y fallaba, sin explicación, en la
     * siguiente renovación. Con `findOneAndUpdate` solo una puede ganar la
     * condición `refreshTokenHash: tokenHash`, y la que pierde se entera en
     * el momento en vez de arrastrar un token ya inservible.
     */
    const session = await SessionModel.findOneAndUpdate(
      {
        userId: payload.sub,
        refreshTokenHash: tokenHash,
        revokedAt: null,
        expiresAt: { $gt: new Date() },
      },
      {
        $set: {
          refreshTokenHash: hashToken(pair.refreshToken),
          previousRefreshTokenHash: tokenHash,
          expiresAt: daysFromNow(30),
        },
      },
    );

    if (!session) {
      /**
       * ¿El hash que llegó es el que la ÚLTIMA rotación dejó atrás? Entonces
       * alguien está reutilizando un token ya canjeado por el siguiente, y no
       * se puede saber quién es el legítimo: el ladrón y el dueño no pueden
       * canjear los dos. Se compara contra `previousRefreshTokenHash`, no
       * contra `refreshTokenHash`: ese campo ya se sobrescribió con el hash
       * siguiente en cuanto hubo una sola rotación, así que comparar contra
       * él nunca encuentra nada y la detección de reuso quedaba muerta en la
       * práctica.
       */
      const reutilizada = await SessionModel.exists({
        userId: payload.sub,
        previousRefreshTokenHash: tokenHash,
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
const recoveryRequestLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, message: 'Demasiadas solicitudes. Intenta nuevamente más tarde.' },
});
const recoveryResetLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, message: 'Demasiados intentos. Intenta nuevamente más tarde.' },
});

authRouter.post('/recovery/request', recoveryRequestLimit, async (req, res, next) => {
  try {
    const body = z.object({ email: z.string().trim().toLowerCase().email().max(160) }).parse(req.body);
    const result = await requestPasswordReset(body.email);
    res.json({ ok: true, message: RECOVERY_PUBLIC_MESSAGE, ...result });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/recovery/reset', recoveryResetLimit, async (req, res, next) => {
  try {
    const body = z.object({
      email: z.string().trim().toLowerCase().email().max(160),
      code: z.string().trim().min(4).max(12),
      newPassword: passwordNueva,
    }).parse(req.body);

    const changed = await resetPassword(body);
    if (!changed) return res.status(400).json({ ok: false, message: RECOVERY_INVALID_MESSAGE });
    res.json({ ok: true, message: 'Contraseña actualizada.' });
  } catch (err) {
    next(err);
  }
});

authRouter.get('/me', identificar, exigirSesion, async (req, res) => {
  const user = await UserModel.findById(req.user!.id)
    .select('_id email role fullName studentId tenantId photoUrl lastLoginAt createdAt updatedAt')
    .lean();
  res.json({ ok: true, user });
});
