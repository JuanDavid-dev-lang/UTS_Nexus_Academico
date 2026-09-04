import { Router } from 'express';
import { z } from 'zod';
import * as campo from '../../shared/validation.js';
import { identificar, requireRole } from '../../middlewares/auth.js';
import { auditChange } from '../../shared/audit.js';
import { emitToAdmins, emitToUser } from '../../shared/socket.js';
import { invalidarAlcance } from '../../shared/program-scope.js';
import { ROLES, NOMBRE_ROL, DESCRIPCION_ROL, ROLES_POR_PROGRAMA } from '../../shared/types.js';
import { buscarPrograma, buscarArea, programasDeAreas } from '../../domains/catalog/uts.js';
import type { Role } from '../../shared/types.js';
import { resolverIdInstitucion } from '../institutions/institution.service.js';
import {
  actualizarUsuario,
  crearUsuario,
  desactivarUsuario,
  listarUsuarios,
  obtenerUsuario,
} from './user.service.js';

/**
 * Personal: quién es qué rol y de qué programas responde.
 *
 * **Solo ADMIN.** Asignar programas es lo que decide el alcance de una
 * coordinación, así que dejarlo en manos de coordinación sería dejar que se
 * ampliara el suyo: el techo de un rol no lo puede mover quien está debajo de
 * él. Por la misma razón el rol se cambia aquí y no desde `/professors`, que
 * edita la ficha docente y no la cuenta.
 */
export const userRouter = Router();

userRouter.use(identificar);
userRouter.use(requireRole('ADMIN'));

/** Catálogo de roles para los desplegables. El cliente no vuelve a traducirlos. */
userRouter.get('/roles', (_req, res) => {
  res.json({
    ok: true,
    items: ROLES.map(role => ({
      id: role,
      nombre: NOMBRE_ROL[role],
      descripcion: DESCRIPCION_ROL[role],
      /** `true` si su alcance se define asignándole programas. */
      porPrograma: ROLES_POR_PROGRAMA.includes(role),
    })),
  });
});

userRouter.get('/', async (req, res, next) => {
  try {
    const query = z
      .object({
        role: z.enum(ROLES as [string, ...string[]]).optional(),
        q: z.string().trim().max(120).optional(),
      })
      .merge(campo.paginacionCon(200))
      .parse(req.query);

    const { skip, limit } = campo.saltoYTope(query);
    const { items, total } = await listarUsuarios(
      { role: query.role, q: query.q },
      skip,
      limit,
    );
    res.json(campo.respuestaPaginada(items, total, query));
  } catch (err) {
    next(err);
  }
});

userRouter.get('/:id', async (req, res, next) => {
  try {
    const item = await obtenerUsuario(String(req.params.id));
    if (!item) return res.status(404).json({ ok: false, message: 'Not found' });
    res.json({ ok: true, item });
  } catch (err) {
    next(err);
  }
});

/**
 * Programas válidos: ids del catálogo, nunca nombres.
 *
 * Un id inventado no daría error en ningún sitio: quedaría guardado, no casaría
 * con ninguna materia y la coordinación vería una pantalla vacía sin ninguna
 * pista de por qué. Se rechaza al escribir, que es el único momento en el que
 * alguien está mirando.
 */
const programas = z
  .array(campo.codigo)
  .max(40)
  .refine(ids => ids.every(id => Boolean(buscarPrograma(id))), {
    message: 'Hay un programa que no está en el catálogo académico.',
  });

/**
 * Áreas: la carrera completa, que es como se coordina de verdad.
 *
 * En las UTS una carrera es una cadena propedéutica —el ciclo tecnológico
 * continúa en el profesional sobre la misma línea—, así que coordinación se
 * asigna por área y no título por título. Se **expanden a programas al
 * guardar**: el alcance sigue viviendo en `programas`, y el área es cómo se
 * elige, no cómo se guarda. Guardar el área en su lugar habría obligado a
 * expandirla en cada consulta y a decidir qué pasa con una adscripción a medias
 * heredada, que hoy es perfectamente representable.
 */
const areas = z
  .array(campo.codigo)
  .max(40)
  .refine(ids => ids.every(id => Boolean(buscarArea(id))), {
    message: 'Hay un área que no está en el catálogo académico.',
  });

/** Une lo pedido por área y por programa suelto, sin repetir. */
function alcanceElegido(input: { programas?: string[]; areas?: string[] }): string[] | undefined {
  if (!input.programas && !input.areas) return undefined;
  return [...new Set([...(input.programas ?? []), ...programasDeAreas(input.areas ?? [])])];
}

/**
 * Alta de una cuenta.
 *
 * La contrasena la fija quien crea la cuenta y se le comunica a la persona:
 * generar una al azar y mostrarla una sola vez suena mas seguro y en la practica
 * acaba en un papel o en un chat, porque hay que transmitirla igual. Lo que si
 * se exige es la politica de siempre (`passwordNueva`), la misma del
 * autorregistro y la recuperacion: la puerta mas floja es la que manda.
 */
userRouter.post('/', async (req, res, next) => {
  try {
    const body = z
      .object({
        email: campo.correo,
        password: campo.passwordNueva,
        fullName: campo.nombre.min(3),
        role: z.enum(ROLES as [string, ...string[]]),
        programas: programas.default([]),
        /** Alternativa cómoda a `programas`: se expande y se suma a ellos. */
        areas: areas.default([]),
        employeeCode: campo.codigo.optional(),
        /** `institutionId` (slug) o `_id`. Obligatoria salvo para ADMIN. */
        institutionId: z.string().trim().min(1).max(40).nullable().optional(),
      })
      .parse(req.body);

    // Todo rol que no sea ADMIN pertenece a una institución: sin ella, una
    // coordinación vería la instalación entera, que es lo que los perfiles
    // institucionales existen para evitar.
    if (body.role !== 'ADMIN' && !body.institutionId) {
      return res.status(400).json({ ok: false, message: 'Indica la institución de la cuenta.' });
    }
    const institutionId = body.role === 'ADMIN' || !body.institutionId
      ? null
      : await resolverIdInstitucion(body.institutionId);

    // Un estudiante no se crea aqui: su cuenta cuelga de una ficha Estudiante
    // (`studentId`), y una sin vincular no ve ni su propio expediente. Se
    // rechaza en vez de crearla rota.
    if (body.role === 'STUDENT') {
      return res.status(400).json({
        ok: false,
        message: 'Las cuentas de estudiante se crean desde la ficha del estudiante, no desde aqui.',
      });
    }

    const item = await crearUsuario({
      ...body,
      role: body.role as Role,
      programas: alcanceElegido(body) ?? [],
      institutionId,
    });
    if (!item) {
      return res.status(409).json({ ok: false, message: 'Ya existe una cuenta con ese correo.' });
    }

    await auditChange({
      actorId: req.user?.id,
      action: 'CREATE',
      entity: 'Usuario',
      entityId: item.id,
      after: { email: item.email, role: item.role, programas: item.programas, institucion: item.institucion?.institutionId ?? null },
    });

    emitToAdmins('sync:update', { entity: 'user', action: 'create', id: item.id });
    res.status(201).json({ ok: true, item });
  } catch (err) {
    next(err);
  }
});

userRouter.patch('/:id', async (req, res, next) => {
  try {
    const body = z
      .object({
        fullName: campo.nombre.min(3).optional(),
        role: z.enum(ROLES as [string, ...string[]]).optional(),
        programas: programas.optional(),
        areas: areas.optional(),
        /** Cambia la institución (slug o `_id`); `null` la quita. Se ignora al pasar a ADMIN. */
        institutionId: z.string().trim().min(1).max(40).nullable().optional(),
      })
      .parse(req.body);

    // Nadie se cambia su propio rol. No es desconfianza: es lo que impide que
    // el último administrador se convierta en docente y deje la instalación sin
    // nadie que pueda deshacerlo.
    if (String(req.params.id) === req.user?.id && body.role && body.role !== 'ADMIN') {
      return res.status(409).json({
        ok: false,
        message: 'No puedes quitarte a ti mismo el rol de administración. Pídeselo a otra cuenta de administración.',
      });
    }

    // `areas` no se guarda: se expande y desaparece del cambio, porque lo que
    // el alcance lee es `programas`. Dejarla pasar crearía un campo en la
    // colección que nadie consulta y que quedaría desincronizado al primer
    // cambio hecho desde otra pantalla.
    const { areas: _areas, institutionId: institucionPedida, ...cambios } = body;
    const elegidos = alcanceElegido(body);
    const { antes, item } = await actualizarUsuario(String(req.params.id), {
      ...cambios,
      ...(elegidos ? { programas: elegidos } : {}),
      ...(institucionPedida === undefined
        ? {}
        : { institutionId: institucionPedida ? await resolverIdInstitucion(institucionPedida) : null }),
    });
    if (!item) return res.status(404).json({ ok: false, message: 'Not found' });

    // El alcance se cachea por usuario: sin invalidarlo, quitarle un programa a
    // una coordinación seguiría dejándosela ver hasta quince segundos. Es poco
    // tiempo y es exactamente el que dura la sospecha de que no se aplicó.
    invalidarAlcance(String(req.params.id));

    await auditChange({
      actorId: req.user?.id,
      action: 'UPDATE',
      entity: 'Usuario',
      entityId: item.id,
      before: { role: antes?.role, programas: antes?.programas, institutionId: antes?.institutionId },
      after: { role: item.role, programas: item.programas, institutionId: item.institucion?.id ?? null },
    });

    // Al interesado, para que su menú y su alcance cambien sin cerrar sesión.
    emitToUser(item.id, 'sync:update', { entity: 'user', action: 'update', id: item.id });
    emitToAdmins('sync:update', { entity: 'user', action: 'update', id: item.id });
    res.json({ ok: true, item });
  } catch (err) {
    next(err);
  }
});

/**
 * Baja de una cuenta. Es un borrado lógico: las notas que capturó siguen
 * llevando su id, y borrarla de verdad dejaría el expediente sin autor.
 */
userRouter.delete('/:id', async (req, res, next) => {
  try {
    if (String(req.params.id) === req.user?.id) {
      return res.status(409).json({ ok: false, message: 'No puedes dar de baja tu propia cuenta.' });
    }

    const item = await desactivarUsuario(String(req.params.id));
    if (!item) return res.status(404).json({ ok: false, message: 'Not found' });

    invalidarAlcance(String(req.params.id));
    await auditChange({
      actorId: req.user?.id,
      action: 'DELETE',
      entity: 'Usuario',
      entityId: item.id,
      before: { email: item.email, role: item.role },
    });

    emitToAdmins('sync:update', { entity: 'user', action: 'delete', id: item.id });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
