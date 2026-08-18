import { Router } from 'express';
import { z } from 'zod';
import * as campo from '../../shared/validation.js';
import { AnnouncementModel } from '../../models/announcement.model.js';
import { ProfessorModel } from '../../models/professor.model.js';
import { identificar, requireRole } from '../../middlewares/auth.js';
import { auditChange } from '../../shared/audit.js';
import { emitSync } from '../../shared/socket.js';
import { FACULTADES, NIVELES, PROGRAMAS, SEDES } from '../../domains/catalog/uts.js';

/**
 * Avisos institucionales.
 *
 * Los escribe la administración y los leen los docentes. El alcance se acota
 * por sede, facultad o programa, y los tres criterios se combinan con Y: un
 * aviso para «Bucaramanga + Ingenierías» llega a quien cumple las dos, no a
 * quien cumple una. Dejar un criterio vacío significa «cualquiera», que es lo
 * que hace que un aviso sin filtros llegue a toda la institución.
 */
export const announcementRouter = Router();

// `identificar` solo rellena `req.user`; no cierra el paso. Quien exige sesión
// es `exigirSesion` o `requireRole`, y va en TODAS las rutas, también en las de
// lectura. Sin él, el listado de avisos respondía 200 a cualquiera sin
// autenticar.
announcementRouter.use(identificar);

/** Roles con sesión iniciada. Leer un aviso no distingue entre ellos. */
const CON_SESION = ['ADMIN', 'PROFESSOR', 'COORDINATOR', 'STUDENT'] as const;

const IDS_PROGRAMA = PROGRAMAS.map(p => p.id);

/** Filtro de alcance para un docente concreto, a partir de su ficha. */
function alcanceDe(ficha: { sede?: string | null; facultad?: string | null; programas?: string[] } | null) {
  const ahora = new Date();
  return {
    deletedAt: null,
    publicadoEn: { $lte: ahora },
    $and: [
      { $or: [{ expiraEn: null }, { expiraEn: { $gt: ahora } }] },
      { $or: [{ sedes: { $size: 0 } }, { sedes: ficha?.sede ?? '—' }] },
      { $or: [{ facultades: { $size: 0 } }, { facultades: ficha?.facultad ?? '—' }] },
      { $or: [{ programas: { $size: 0 } }, { programas: { $in: ficha?.programas ?? [] } }] },
    ],
  };
}

/** Avisos visibles para quien pregunta. */
announcementRouter.get('/', requireRole(...CON_SESION), async (req, res, next) => {
  try {
    // La administración ve todo, incluidos los programados y los caducados:
    // necesita poder revisar lo que publicó, no solo lo vigente.
    const esGestor = req.user?.role === 'ADMIN' || req.user?.role === 'COORDINATOR';

    let filtro: Record<string, unknown> = { deletedAt: null };
    if (!esGestor) {
      const ficha = await ProfessorModel.findOne({ userId: req.user?.id, deletedAt: null })
        .select('sede facultad programas')
        .lean();
      filtro = alcanceDe(ficha);
    }

    const pagina = campo.paginacionCon(200).parse(req.query);
    const { skip, limit } = campo.saltoYTope(pagina);
    const yo = String(req.user?.id ?? '');

    // `sinLeer` se cuenta contra el filtro completo, no contra la página: el
    // contador de la campana tiene que decir cuántos avisos hay sin leer, no
    // cuántos de los que caben en la primera página.
    const [items, total, sinLeer] = await Promise.all([
      AnnouncementModel.find(filtro)
        .populate('autorId', 'fullName')
        .sort({ fijado: -1, publicadoEn: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      AnnouncementModel.countDocuments(filtro),
      AnnouncementModel.countDocuments({ ...filtro, leidoPor: { $ne: req.user?.id } }),
    ]);

    res.json({
      ...campo.respuestaPaginada(
        items.map(item => ({
          ...item,
          leido: (item.leidoPor ?? []).some(id => String(id) === yo),
          // La lista de lectores no se expone: quién abrió qué es información
          // sobre las personas, no sobre el aviso.
          leidoPor: undefined,
          lecturas: (item.leidoPor ?? []).length,
        })),
        total,
        pagina,
      ),
      sinLeer,
    });
  } catch (err) {
    next(err);
  }
});

const cuerpo = z.object({
  titulo: z.string().trim().min(4, 'El título es demasiado corto.').max(140),
  cuerpo: z.string().trim().min(10, 'Escribe el contenido del aviso.').max(4000),
  tipo: z.enum(['INFORMATIVO', 'IMPORTANTE', 'URGENTE']).default('INFORMATIVO'),
  sedes: z.array(z.enum(SEDES)).default([]),
  facultades: z.array(z.enum(FACULTADES)).default([]),
  programas: z.array(z.string().refine(id => IDS_PROGRAMA.includes(id), 'Programa desconocido.')).default([]),
  publicadoEn: z.coerce.date().default(() => new Date()),
  expiraEn: z.coerce.date().nullable().default(null),
  fijado: z.boolean().default(false),
});

/**
 * Docentes que pueden llegar a leer un aviso.
 *
 * No es `estado: 'APROBADO'`: las fichas anteriores a que existiera ese campo
 * no lo tienen, y `$eq` no encuentra lo que falta. Como el login solo cierra el
 * paso a `PENDIENTE` y `RECHAZADO`, ese es el criterio que de verdad decide, y
 * `$nin` sí incluye a quien no tiene el campo.
 */
const DOCENTES_ACTIVOS = { deletedAt: null, estado: { $nin: ['PENDIENTE', 'RECHAZADO'] } };

/** Filtro sobre las fichas de docente equivalente al alcance de un aviso. */
function docentesEnAlcance(alcance: { sedes: string[]; facultades: string[]; programas: string[] }) {
  const filtro: Record<string, unknown> = { ...DOCENTES_ACTIVOS };
  if (alcance.sedes.length) filtro.sede = { $in: alcance.sedes };
  if (alcance.facultades.length) filtro.facultad = { $in: alcance.facultades };
  if (alcance.programas.length) filtro.programas = { $in: alcance.programas };
  return filtro;
}

/**
 * Cuántos docentes recibirían un aviso con este alcance.
 *
 * Existe porque los tres criterios se combinan con Y y eso se nota tarde: se
 * marcaban cuatro programas creyendo ampliar el alcance y el aviso no le
 * llegaba a nadie, sin que nada lo dijera. Es la misma condición que aplica
 * `alcanceDe` al leer, resuelta antes de publicar en vez de después.
 */
announcementRouter.post('/destinatarios', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const alcance = cuerpo
      .pick({ sedes: true, facultades: true, programas: true })
      .parse(req.body ?? {});

    const [alcanzados, total] = await Promise.all([
      ProfessorModel.countDocuments(docentesEnAlcance(alcance)),
      ProfessorModel.countDocuments(DOCENTES_ACTIVOS),
    ]);

    res.json({ ok: true, alcanzados, total });
  } catch (err) {
    next(err);
  }
});

announcementRouter.post('/', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const datos = cuerpo.parse(req.body);

    if (datos.expiraEn && datos.expiraEn <= datos.publicadoEn) {
      return res.status(400).json({
        ok: false,
        message: 'La fecha de caducidad tiene que ser posterior a la de publicación.',
      });
    }

    const item = await AnnouncementModel.create({ ...datos, autorId: req.user?.id });

    await auditChange({
      actorId: req.user?.id,
      action: 'CREATE',
      entity: 'Aviso',
      entityId: item.id,
      after: item.toObject(),
    });
    emitSync('sync:update', { entity: 'announcement', action: 'create', id: item.id });
    // Poblado como en el listado: si aquí se devuelve el ObjectId a secas, el
    // cliente recibe un aviso con una forma distinta de la que ya conoce.
    await item.populate('autorId', 'fullName');
    res.status(201).json({ ok: true, item });
  } catch (err) {
    next(err);
  }
});

announcementRouter.patch('/:id', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const datos = cuerpo.partial().parse(req.body);

    const item = await AnnouncementModel.findOneAndUpdate(
      { _id: req.params.id, deletedAt: null },
      { $set: datos },
      { new: true },
    );
    if (!item) return res.status(404).json({ ok: false, message: 'Aviso no encontrado.' });

    emitSync('sync:update', { entity: 'announcement', action: 'update', id: item.id });
    res.json({ ok: true, item });
  } catch (err) {
    next(err);
  }
});

/** Marca como leído para quien pregunta. Idempotente. */
announcementRouter.post('/:id/leido', requireRole(...CON_SESION), async (req, res, next) => {
  try {
    const item = await AnnouncementModel.findOneAndUpdate(
      { _id: req.params.id, deletedAt: null },
      // $addToSet y no $push: abrir el aviso dos veces no cuenta como dos.
      { $addToSet: { leidoPor: req.user?.id } },
      { new: true },
    );
    if (!item) return res.status(404).json({ ok: false, message: 'Aviso no encontrado.' });

    emitSync('sync:update', { entity: 'announcement', action: 'update', id: item.id });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

announcementRouter.delete('/:id', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const item = await AnnouncementModel.findOneAndUpdate(
      { _id: req.params.id, deletedAt: null },
      { $set: { deletedAt: new Date(), status: 'DELETED' } },
      { new: true },
    );
    if (!item) return res.status(404).json({ ok: false, message: 'Aviso no encontrado.' });

    await auditChange({ actorId: req.user?.id, action: 'DELETE', entity: 'Aviso', entityId: item.id });
    emitSync('sync:update', { entity: 'announcement', action: 'delete', id: item.id });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/** Niveles del catálogo, para que el formulario de aviso no los invente. */
announcementRouter.get('/catalogo/niveles', requireRole('ADMIN'), (_req, res) => {
  res.json({ ok: true, niveles: NIVELES });
});
