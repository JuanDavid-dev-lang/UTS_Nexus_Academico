import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { UserModel } from '../../models/user.model.js';
import { ProfessorModel } from '../../models/professor.model.js';
import { ConfigModel } from '../../models/config.model.js';
import { SessionModel } from '../../models/session.model.js';
import { identificar, requireRole } from '../../middlewares/auth.js';
import { auditChange } from '../../shared/audit.js';
import { emitSync } from '../../shared/socket.js';
import {
  FACULTADES,
  NIVELES,
  NOMBRE_FACULTAD,
  NOMBRE_NIVEL,
  NOMBRE_SEDE,
  PROGRAMAS,
  SEDES,
  validarAdscripcion,
} from '../../domains/catalog/uts.js';

/**
 * Autorregistro de docentes.
 *
 * Dos puertas, y cada una protege algo distinto. El interruptor que maneja la
 * administración decide CUÁNDO se puede registrar alguien; la aprobación decide
 * QUIÉN entra. Con solo el interruptor, cualquiera que diera con la dirección
 * durante la ventana abierta tendría una cuenta de docente, y una cuenta de
 * docente puede buscar en el directorio global de estudiantes para matricular:
 * sería acceso a la identidad de cualquier estudiante de la institución.
 *
 * Por eso el registro crea la cuenta en estado `PENDIENTE` y no deja iniciar
 * sesión hasta que alguien la revisa.
 */
export const registrationRouter = Router();

/** Clave del interruptor en la colección de configuración. */
const CLAVE_REGISTRO = 'registro_docentes_abierto';

async function registroAbierto(): Promise<boolean> {
  const config = await ConfigModel.findOne({ key: CLAVE_REGISTRO }).lean();
  // Cerrado por defecto: si nadie lo ha abierto nunca, no está abierto.
  return config?.value === true;
}

// ── Catálogo público ────────────────────────────────────────────────────────
// Sin autenticación a propósito: el formulario de registro lo necesita antes de
// que exista la cuenta. No revela nada que no esté en la web de la institución.
registrationRouter.get('/catalogo', async (_req, res, next) => {
  try {
    res.json({
      ok: true,
      abierto: await registroAbierto(),
      sedes: SEDES.map(id => ({ id, nombre: NOMBRE_SEDE[id] })),
      facultades: FACULTADES.map(id => ({ id, nombre: NOMBRE_FACULTAD[id] })),
      niveles: NIVELES.map(id => ({ id, nombre: NOMBRE_NIVEL[id] })),
      programas: PROGRAMAS,
    });
  } catch (err) {
    next(err);
  }
});

const solicitud = z.object({
  cedula: z.string().trim().regex(/^\d{6,10}$/, 'La cédula debe tener entre 6 y 10 dígitos.'),
  nombres: z.string().trim().min(2, 'Escribe tus nombres.'),
  apellidos: z.string().trim().min(2, 'Escribe tus apellidos.'),
  sede: z.enum(SEDES),
  facultad: z.enum(FACULTADES),
  niveles: z.array(z.enum(NIVELES)).min(1, 'Indica al menos un nivel.'),
  programas: z.array(z.string()).min(1, 'Indica al menos un programa.'),
  email: z.string().trim().toLowerCase().email('Correo inválido.'),
  password: z
    .string()
    .min(10, 'La contraseña necesita al menos 10 caracteres.')
    .regex(/[a-z]/, 'Incluye alguna letra minúscula.')
    .regex(/[A-Z]/, 'Incluye alguna letra mayúscula.')
    .regex(/\d/, 'Incluye algún número.'),
});

// ── Solicitud de registro ───────────────────────────────────────────────────
registrationRouter.post('/', async (req, res, next) => {
  try {
    if (!(await registroAbierto())) {
      return res.status(403).json({
        ok: false,
        message: 'El registro de docentes está cerrado. Pídele a la administración que lo habilite.',
      });
    }

    const datos = solicitud.parse(req.body);

    const errores = validarAdscripcion(datos);
    if (errores.length > 0) {
      return res.status(400).json({ ok: false, message: errores[0]?.mensaje, errores });
    }

    // Se comprueban las dos unicidades por separado para poder decir cuál falla.
    if (await UserModel.exists({ email: datos.email })) {
      return res.status(409).json({ ok: false, message: 'Ya hay una cuenta con ese correo.' });
    }
    if (await ProfessorModel.exists({ cedula: datos.cedula, deletedAt: null })) {
      return res.status(409).json({ ok: false, message: 'Ya hay un registro con esa cédula.' });
    }

    const usuario = await UserModel.create({
      email: datos.email,
      passwordHash: await bcrypt.hash(datos.password, 12),
      role: 'PROFESSOR',
      fullName: `${datos.nombres} ${datos.apellidos}`.replace(/\s+/g, ' ').trim(),
    });

    const profesor = await ProfessorModel.create({
      userId: usuario._id,
      cedula: datos.cedula,
      nombres: datos.nombres,
      apellidos: datos.apellidos,
      sede: datos.sede,
      facultad: datos.facultad,
      niveles: datos.niveles,
      programas: datos.programas,
      employeeCode: datos.cedula,
      department: NOMBRE_FACULTAD[datos.facultad],
      // Nace pendiente: la cuenta existe pero todavía no abre nada.
      estado: 'PENDIENTE',
    });

    await auditChange({
      actorId: String(usuario._id),
      action: 'CREATE',
      entity: 'Profesor',
      entityId: profesor.id,
      after: { estado: 'PENDIENTE', cedula: datos.cedula, sede: datos.sede },
    });

    // Se avisa a la administración para que no dependa de entrar a mirar.
    emitSync('sync:update', { entity: 'registration', action: 'create', id: profesor.id });

    res.status(201).json({
      ok: true,
      message:
        'Solicitud enviada. Un administrador tiene que aprobarla antes de que puedas entrar; ' +
        'te avisaremos al correo que registraste.',
    });
  } catch (err) {
    next(err);
  }
});

// ── Administración ──────────────────────────────────────────────────────────
registrationRouter.use(identificar);

/** Estado del interruptor y cuántas solicitudes esperan. */
registrationRouter.get('/estado', requireRole('ADMIN', 'COORDINATOR'), async (_req, res, next) => {
  try {
    res.json({
      ok: true,
      abierto: await registroAbierto(),
      pendientes: await ProfessorModel.countDocuments({ estado: 'PENDIENTE', deletedAt: null }),
    });
  } catch (err) {
    next(err);
  }
});

/** Abre o cierra el registro. Solo ADMIN. */
registrationRouter.patch('/estado', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const { abierto } = z.object({ abierto: z.boolean() }).parse(req.body);

    const fila = await ConfigModel.findOneAndUpdate(
      { key: CLAVE_REGISTRO },
      { $set: { value: abierto } },
      { upsert: true, new: true },
    );

    await auditChange({
      actorId: req.user?.id,
      action: 'UPDATE',
      entity: 'Configuracion',
      // El id de la fila, no su clave: `entityId` es un ObjectId en el modelo
      // de auditoría. Pasarle 'registro_docentes_abierto' reventaba el guardado
      // con un CastError, y con él la petición entera.
      entityId: fila.id,
      after: { abierto },
    });

    emitSync('sync:update', { entity: 'registration', action: 'update', id: CLAVE_REGISTRO });
    res.json({ ok: true, abierto });
  } catch (err) {
    next(err);
  }
});

/** Solicitudes, con los datos que hacen falta para decidir. */
registrationRouter.get('/solicitudes', requireRole('ADMIN', 'COORDINATOR'), async (req, res, next) => {
  try {
    const estado = z
      .enum(['PENDIENTE', 'APROBADO', 'RECHAZADO'])
      .default('PENDIENTE')
      .parse(req.query.estado ?? 'PENDIENTE');

    const items = await ProfessorModel.find({ estado, deletedAt: null })
      .populate('userId', 'email fullName createdAt')
      .sort({ createdAt: 1 })
      .limit(300)
      .lean();

    res.json({ ok: true, items });
  } catch (err) {
    next(err);
  }
});

/** Aprueba o rechaza una solicitud. */
registrationRouter.patch('/solicitudes/:id', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const { decision, motivo } = z
      .object({
        decision: z.enum(['APROBADO', 'RECHAZADO']),
        motivo: z.string().trim().max(300).default(''),
      })
      .parse(req.body);

    const antes = await ProfessorModel.findOne({ _id: req.params.id, deletedAt: null }).lean();
    if (!antes) return res.status(404).json({ ok: false, message: 'Solicitud no encontrada.' });

    const item = await ProfessorModel.findOneAndUpdate(
      { _id: req.params.id },
      {
        $set: {
          estado: decision,
          revisadoPor: req.user?.id,
          revisadoEn: new Date(),
          motivoRechazo: decision === 'RECHAZADO' ? motivo : '',
        },
      },
      { new: true },
    );

    if (decision === 'RECHAZADO') {
      await SessionModel.updateMany(
        { userId: antes.userId, revokedAt: null },
        { $set: { revokedAt: new Date() } },
      );
    }

    await auditChange({
      actorId: req.user?.id,
      action: 'UPDATE',
      entity: 'Profesor',
      entityId: String(req.params.id),
      before: antes,
      after: item?.toObject(),
    });

    emitSync('sync:update', { entity: 'registration', action: 'update', id: String(req.params.id) });
    res.json({ ok: true, item });
  } catch (err) {
    next(err);
  }
});
