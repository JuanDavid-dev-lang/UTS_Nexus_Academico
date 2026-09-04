import { Router } from 'express';
import { z } from 'zod';
import * as campo from '../../shared/validation.js';
import { identificar, requireRole } from '../../middlewares/auth.js';
import { ProfessorModel } from '../../models/professor.model.js';
import { UserModel } from '../../models/user.model.js';
import { emitToUser } from '../../shared/socket.js';
import { auditChange } from '../../shared/audit.js';

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
    const item = await ProfessorModel.findOne({ userId: req.user?.id, deletedAt: null })
      // La institución va poblada: el perfil muestra a qué universidad
      // pertenece, y el docente no la edita (`PATCH /me` no la acepta).
      .populate('institutionId', 'institutionId nombre sigla activa')
      .lean();
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

/**
 * Listado administrativo de docentes.
 *
 * Acepta `q` (nombre, apellido o cédula), `programa` y `director=true`, que se
 * combinan con Y. Existe para la pantalla donde la administración busca a un
 * docente por carrera y le activa (o quita) la dirección de trabajos de grado.
 */
professorRouter.get('/', requireRole('ADMIN', 'COORDINATOR'), async (req, res, next) => {
  try {
    const filtro: Record<string, unknown> = { deletedAt: null };
    if (req.query.programa) filtro.programas = String(req.query.programa);
    // Coordinacion y secretaria ven a los docentes de sus programas: los
    // adscritos a la carrera y los que dictan alguna de sus materias sin
    // estarlo (suplencias). Se aplica DESPUES del filtro `programa` de la URL,
    // que asi solo puede estrechar la lista, nunca ampliarla a otra carrera.
    if (req.alcance && !req.alcance.total) {
      const pedido = typeof filtro.programas === 'string' ? filtro.programas : null;
      const programas = pedido
        ? (req.alcance.programas.includes(pedido) ? [pedido] : [])
        : req.alcance.programas;
      delete filtro.programas;
      filtro.$and = [
        ...(Array.isArray(filtro.$and) ? filtro.$and : []),
        { $or: [{ programas: { $in: programas } }, { userId: { $in: req.alcance.professorIds } }] },
      ];
    }
    if (req.query.director === 'true') filtro.esDirectorTrabajoGrado = true;
    if (req.query.q) {
      // Regex escapado: la búsqueda es texto del usuario, no un patrón.
      const escapado = String(req.query.q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const patron = new RegExp(escapado, 'i');
      filtro.$or = [{ nombres: patron }, { apellidos: patron }, { cedula: patron }];
    }

    const pagina = campo.paginacionCon(100).parse(req.query);
    const { skip, limit } = campo.saltoYTope(pagina);
    const [items, total] = await Promise.all([
      ProfessorModel.find(filtro)
        .populate('userId', 'fullName email')
        .sort({ apellidos: 1, nombres: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      ProfessorModel.countDocuments(filtro),
    ]);
    res.json(campo.respuestaPaginada(items, total, pagina));
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
      // Institucional: solo desde aquí, nunca desde `PATCH /me`.
      esDirectorTrabajoGrado: z.boolean().optional(),
    }).parse(req.body);

    const antes = await ProfessorModel.findOne({ _id: req.params.id, deletedAt: null }).lean();
    if (!antes) return res.status(404).json({ ok: false, message: 'Not found' });

    // Una coordinacion no edita la ficha de un docente de otra carrera. El
    // listado ya no se los muestra, pero filtrar solo el listado deja la ficha
    // escribible a quien copie un id.
    if (req.alcance && !req.alcance.total) {
      const suyo =
        (antes.programas ?? []).some(programa => req.alcance!.programas.includes(programa)) ||
        req.alcance.professorIds.includes(String(antes.userId));
      if (!suyo) {
        return res.status(403).json({ ok: false, message: 'Docente fuera de tus programas' });
      }
    }

    const item = await ProfessorModel.findOneAndUpdate({ _id: req.params.id, deletedAt: null }, { $set: body }, { new: true });
    if (!item) return res.status(404).json({ ok: false, message: 'Not found' });

    // Quién le dio (o quitó) la dirección de trabajos de grado a quién es de
    // las cosas que hay que poder mirar después.
    if (body.esDirectorTrabajoGrado !== undefined && body.esDirectorTrabajoGrado !== antes.esDirectorTrabajoGrado) {
      await auditChange({
        actorId: req.user?.id,
        action: 'UPDATE',
        entity: 'Profesor',
        entityId: item.id,
        before: { esDirectorTrabajoGrado: antes.esDirectorTrabajoGrado },
        after: { esDirectorTrabajoGrado: body.esDirectorTrabajoGrado },
      });
    }

    // Al docente (para que su menú cambie en vivo) y a las salas ADMIN/COORDINATOR.
    emitToUser(String(item.userId), 'sync:update', { entity: 'professor', action: 'update', id: item.id });
    res.json({ ok: true, item });
  } catch (err) {
    next(err);
  }
});

