import { Router } from 'express';
import { z } from 'zod';
import { identificar, requireRole } from '../../middlewares/auth.js';
import { ProfessorModel } from '../../models/professor.model.js';
import { UserModel } from '../../models/user.model.js';
import { emitToUser, emitSync } from '../../shared/socket.js';

export const professorRouter = Router();
professorRouter.use(identificar);

/**
 * Campos que el propio docente puede cambiar de su ficha.
 *
 * Deliberadamente NO están aquí `employeeCode`, `estado`, `sede`, `facultad`,
 * `niveles` ni `programas`: son datos institucionales que decide la
 * administración. Que alguien pueda editar su propio alcance académico
 * significaría poder ampliarlo.
 *
 * `photoUrl` acepta también una ruta relativa porque es lo que devuelve
 * `POST /uploads/image` (`/uploads/<archivo>`). Exigiendo URL absoluta, como
 * hacía el esquema anterior, una foto recién subida por la propia aplicación
 * era imposible de guardar.
 */
const rutaDeImagen = z
  .string()
  .refine(
    valor => valor.startsWith('/uploads/') || /^https?:\/\//.test(valor),
    'Debe ser una URL http(s) o una ruta subida a /uploads'
  );

const perfilPropioSchema = z.object({
  title: z.string().trim().min(2).max(80).optional(),
  department: z.string().trim().min(2).max(120).optional(),
  photoUrl: rutaDeImagen.nullable().optional(),
  signatureUrl: rutaDeImagen.nullable().optional(),
});

/** Ficha del docente que hace la petición. */
professorRouter.get('/me', requireRole('PROFESSOR', 'ADMIN', 'COORDINATOR'), async (req, res, next) => {
  try {
    const item = await ProfessorModel.findOne({ userId: req.user?.id, deletedAt: null }).lean();
    if (!item) return res.status(404).json({ ok: false, message: 'Sin ficha de docente' });
    res.json({ ok: true, item });
  } catch (err) {
    next(err);
  }
});

/**
 * El docente edita su propio perfil.
 *
 * Existe como ruta separada de `PATCH /:id` para no tener que confiar en que
 * quien llama mande su propio id: aquí el id no viaja, se toma de la sesión.
 */
professorRouter.patch('/me', requireRole('PROFESSOR', 'ADMIN', 'COORDINATOR'), async (req, res, next) => {
  try {
    const body = perfilPropioSchema.parse(req.body);
    const fullName = z.string().trim().min(3).max(120).optional().parse(req.body?.fullName);

    const item = await ProfessorModel.findOneAndUpdate(
      { userId: req.user?.id, deletedAt: null },
      { $set: body },
      { new: true }
    );
    if (!item) return res.status(404).json({ ok: false, message: 'Sin ficha de docente' });

    // El nombre y la foto que ve el resto de la aplicación viven en Usuario;
    // sin esto el perfil cambiaría y la barra superior seguiría con lo viejo.
    if (fullName || body.photoUrl !== undefined) {
      await UserModel.updateOne(
        { _id: req.user?.id },
        {
          $set: {
            ...(fullName ? { fullName } : {}),
            ...(body.photoUrl !== undefined ? { photoUrl: body.photoUrl } : {}),
          },
        }
      );
    }

    // Solo a quien lo cambió: el perfil de un docente no le importa al resto.
    emitToUser(String(req.user?.id), 'sync:update', {
      entity: 'professor',
      action: 'update',
      id: item.id,
    });
    res.json({ ok: true, item });
  } catch (err) {
    next(err);
  }
});

professorRouter.get('/', requireRole('ADMIN', 'COORDINATOR'), async (_req, res, next) => {
  try {
    const items = await ProfessorModel.find({ deletedAt: null }).limit(100).lean();
    res.json({ ok: true, items });
  } catch (err) {
    next(err);
  }
});

/**
 * Edición administrativa de la ficha de un docente.
 *
 * Antes esta ruta admitía el rol PROFESSOR y no comprobaba de quién era el id:
 * cualquier docente podía escribir sobre la ficha de otro —su cargo, su
 * departamento, su firma— con solo cambiar un número en la URL. Un docente que
 * quiera editarse a sí mismo tiene `PATCH /me`, donde el id sale de la sesión y
 * no del cliente; aquí quedan ADMIN y COORDINATOR, que es de quien es la tarea.
 */
professorRouter.patch('/:id', requireRole('ADMIN', 'COORDINATOR'), async (req, res, next) => {
  try {
    const body = z.object({
      employeeCode: z.string().optional(),
      department: z.string().optional(),
      title: z.string().optional(),
      photoUrl: rutaDeImagen.nullable().optional(),
      signatureUrl: rutaDeImagen.nullable().optional(),
    }).parse(req.body);
    const item = await ProfessorModel.findOneAndUpdate({ _id: req.params.id, deletedAt: null }, { $set: body }, { new: true });
    if (!item) return res.status(404).json({ ok: false, message: 'Not found' });
    emitSync('sync:update', { entity: 'professor', action: 'update', id: item.id });
    res.json({ ok: true, item });
  } catch (err) {
    next(err);
  }
});

