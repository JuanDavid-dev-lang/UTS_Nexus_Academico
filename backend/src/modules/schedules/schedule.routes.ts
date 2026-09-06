import { Router } from 'express';
import { Types } from 'mongoose';
import multer from 'multer';
import { z } from 'zod';
import { ScheduleModel } from '../../models/schedule.model.js';
import { SubjectModel } from '../../models/subject.model.js';
import { GroupModel } from '../../models/group.model.js';
import { identificar, requireRole } from '../../middlewares/auth.js';
import { emitToUser } from '../../shared/socket.js';
import { crearNotificacion, fechaCampus } from '../../shared/notify.js';
import { getProfessorScope } from '../../shared/professor-scope.js';
import { mlFetch } from '../../shared/ml-client.js';

export const scheduleRouter = Router();
scheduleRouter.use(identificar);

/**
 * Avisa al docente de que su horario cambió.
 *
 * Con clave por día: mover cuatro franjas seguidas es UN cambio de horario para
 * quien lo recibe, no cuatro avisos. Y el evento de sincronización viaja
 * siempre, aunque el aviso se haya deduplicado: la pantalla abierta tiene que
 * repintarse en los cuatro casos.
 */
async function avisarCambioDeHorario(teacherId: string, actorId: string | undefined, detalle: string) {
  emitToUser(teacherId, 'sync:update', { entity: 'schedule', action: 'change', id: teacherId });
  // Si el propio docente acaba de moverlo, ya lo sabe: notificárselo sería
  // contarle lo que acaba de hacer.
  if (actorId === teacherId) return;

  await crearNotificacion({
    userId: teacherId,
    type: 'SCHEDULE',
    priority: 'IMPORTANT',
    title: 'Tu horario fue actualizado',
    message: detalle,
    dedupeKey: `schedule-changed:${teacherId}:${fechaCampus(new Date())}`,
    link: '/agenda',
    metadata: { teacherId },
  });
}

/** Un docente solo toca franjas de sus materias. */
async function puedeTocarMateria(
  usuario: { id: string; role: string } | undefined,
  subjectId: string,
): Promise<boolean> {
  if (usuario?.role !== 'PROFESSOR') return true;
  const scope = await getProfessorScope(usuario.id);
  return scope.subjectIds.includes(subjectId);
}

scheduleRouter.get('/', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'), async (_req, res, next) => {
  try {
    const filter: Record<string, unknown> = { deletedAt: null };
    if (_req.user?.role === 'PROFESSOR') filter.teacherId = _req.user.id;
    const items = await ScheduleModel.find(filter).sort({ order: 1, dayOfWeek: 1, startTime: 1 }).limit(200).lean();

    // El nombre de la materia viaja con la franja: la pantalla de horario
    // mostraba el ObjectId recortado porque no tenía con qué resolverlo.
    const subjectIds = [...new Set(items.map(item => String(item.subjectId)).filter(Boolean))];
    const materias = subjectIds.length
      ? await SubjectModel.find({ _id: { $in: subjectIds } }).select('name code period').lean()
      : [];
    const porId = new Map(materias.map(materia => [String(materia._id), materia]));

    res.json({
      ok: true,
      items: items.map(item => {
        const materia = porId.get(String(item.subjectId));
        return {
          ...item,
          subjectName: String(materia?.name ?? ''),
          subjectCode: String(materia?.code ?? ''),
          period: String(materia?.period ?? ''),
        };
      }),
    });
  } catch (err) {
    next(err);
  }
});

scheduleRouter.post('/', requireRole('ADMIN', 'PROFESSOR'), async (req, res, next) => {
  try {
    const body = z.object({
      subjectId: z.string(),
      groupId: z.string().optional(),
      teacherId: z.string(),
      dayOfWeek: z.number().int().min(1).max(7),
      startTime: z.string().regex(/^\d{2}:\d{2}$/),
      endTime: z.string().regex(/^\d{2}:\d{2}$/),
      order: z.number().int().min(0).default(0),
      durationMinutes: z.number().int().min(30).max(300).default(90),
      classroom: z.string().default(''),
      modality: z.enum(['PRESENTIAL', 'VIRTUAL', 'HYBRID']).default('PRESENTIAL'),
    }).parse(req.body);

    if (!(await puedeTocarMateria(req.user, body.subjectId))) {
      return res.status(403).json({ ok: false, message: 'Subject not assigned' });
    }
    if (req.user?.role === 'PROFESSOR' && body.teacherId !== req.user.id) {
      return res.status(403).json({ ok: false, message: 'Forbidden' });
    }

    const item = await ScheduleModel.create(body);
    await avisarCambioDeHorario(String(item.teacherId), req.user?.id, 'Se agregó una clase a tu horario.');
    res.status(201).json({ ok: true, item });
  } catch (err) {
    next(err);
  }
});

scheduleRouter.patch('/:id', requireRole('ADMIN', 'PROFESSOR'), async (req, res, next) => {
  try {
    const body = z.object({
      order: z.number().int().min(0).optional(),
      dayOfWeek: z.number().int().min(1).max(7).optional(),
      startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
      endTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
      durationMinutes: z.number().int().min(30).max(300).optional(),
      classroom: z.string().optional(),
      modality: z.enum(['PRESENTIAL', 'VIRTUAL', 'HYBRID']).optional(),
    }).parse(req.body);

    const filtro: Record<string, unknown> = { _id: req.params.id, deletedAt: null };
    // Sin esto, un docente podía mover la franja de otro conociendo su id.
    if (req.user?.role === 'PROFESSOR') filtro.teacherId = req.user.id;

    const item = await ScheduleModel.findOneAndUpdate(filtro, { $set: body }, { new: true });
    if (!item) return res.status(404).json({ ok: false, message: 'Not found' });

    await avisarCambioDeHorario(String(item.teacherId), req.user?.id, 'Una de tus clases cambió de horario o de aula.');
    res.json({ ok: true, item });
  } catch (err) {
    next(err);
  }
});

scheduleRouter.delete('/:id', requireRole('ADMIN', 'PROFESSOR'), async (req, res, next) => {
  try {
    const filtro: Record<string, unknown> = { _id: req.params.id, deletedAt: null };
    if (req.user?.role === 'PROFESSOR') filtro.teacherId = req.user.id;

    // Baja lógica: el índice único es sobre (materia, día, hora, docente), y
    // borrar de verdad impediría distinguir "nunca existió" de "se canceló".
    const item = await ScheduleModel.findOneAndUpdate(
      filtro,
      { $set: { deletedAt: new Date(), status: 'CANCELLED' } },
      { new: true },
    );
    if (!item) return res.status(404).json({ ok: false, message: 'Not found' });

    await avisarCambioDeHorario(String(item.teacherId), req.user?.id, 'Se retiró una clase de tu horario.');
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

scheduleRouter.post('/reorder', requireRole('ADMIN', 'PROFESSOR'), async (req, res, next) => {
  try {
    const body = z.object({
      items: z.array(z.object({ id: z.string(), order: z.number().int().min(0) })).min(1),
    }).parse(req.body);

    const filtroBase: Record<string, unknown> = { deletedAt: null };
    if (req.user?.role === 'PROFESSOR') filtroBase.teacherId = req.user.id;

    await Promise.all(
      body.items.map(item =>
        ScheduleModel.findOneAndUpdate({ ...filtroBase, _id: item.id }, { $set: { order: item.order } }, { new: true })
      )
    );

    // Reordenar es cosmético: cambia cómo se lista, no cuándo es la clase. Se
    // sincroniza, pero no genera notificación.
    emitToUser(req.user!.id, 'sync:update', { entity: 'schedule', action: 'reorder', id: String(body.items.length) });
    res.json({ ok: true, count: body.items.length });
  } catch (err) {
    next(err);
  }
});

// ── Importación del horario desde el reporte PDF de Academusoft ─────────────

const subirHorario = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
});

/** Minutos entre dos horas de pared, contando el minuto final (07:30-10:29 = 180). */
function minutosDe(inicio: string, fin: string): number {
  const [hi, mi] = inicio.split(':').map(Number);
  const [hf, mf] = fin.split(':').map(Number);
  const minutos = hf * 60 + mf - (hi * 60 + mi) + 1;
  return Math.min(300, Math.max(30, minutos));
}

type SesionLeida = {
  codigo: string;
  nombre: string;
  grupo: string;
  dia: number;
  horaInicio: string;
  horaFin: string;
  aula: string;
  confianza: number;
  avisos: string[];
};

/**
 * Lee el reporte de horario y PROPONE las sesiones. No escribe nada: la
 * escritura es `/import/confirm`, con lo que el docente ya revisó. La
 * interpretación geométrica (qué columna es cada día) vive en el servicio de
 * visión, que es quien sabe leer PDF.
 */
scheduleRouter.post(
  '/import/scan',
  requireRole('ADMIN', 'PROFESSOR'),
  subirHorario.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({ ok: false, message: 'Falta el PDF del horario.' });
      }
      const query = z.object({ period: z.string().min(4) }).parse(req.query);

      const formulario = new FormData();
      const bytes = new Uint8Array(req.file.buffer);
      formulario.append('file', new Blob([bytes]), req.file.originalname || 'horario.pdf');

      let lectura: { origen: string; avisos: string[]; sesiones: SesionLeida[] };
      try {
        // Sin `Content-Type`: lo compone `fetch` con su boundary a partir del
        // FormData. `mlFetch` añade el secreto compartido del servicio.
        const respuesta = await mlFetch('/vision/schedule', {
          method: 'POST',
          body: formulario,
          timeoutMs: 60_000,
        });
        if (!respuesta.ok) {
          const detalle = (await respuesta.json().catch(() => ({}))) as { detail?: string };
          return res.status(respuesta.status === 422 ? 400 : 502).json({
            ok: false,
            message: detalle.detail || 'El lector de horarios no pudo interpretar el archivo.',
          });
        }
        lectura = (await respuesta.json()) as typeof lectura;
      } catch {
        return res.status(503).json({
          ok: false,
          message: 'El servicio de lectura no está disponible. Inténtalo en unos minutos.',
        });
      }

      // Cruce con lo que el docente ya tiene: qué materias existen y qué
      // franjas ya están en su horario, para que la revisión diga la verdad
      // («se creará» / «ya existe») en vez de descubrirse al confirmar.
      const codigos = [...new Set(lectura.sesiones.map(s => s.codigo))];
      const filtroMaterias: Record<string, unknown> = {
        code: { $in: codigos },
        period: query.period,
        deletedAt: null,
      };
      if (req.user?.role === 'PROFESSOR') filtroMaterias.professorId = req.user.id;
      const materias = await SubjectModel.find(filtroMaterias).select('code').lean();
      const codigosExistentes = new Set(materias.map(m => m.code));

      const franjas = await ScheduleModel.find({
        teacherId: req.user!.id,
        deletedAt: null,
      })
        .select('dayOfWeek startTime subjectId')
        .lean();
      const franjasExistentes = new Set(franjas.map(f => `${f.dayOfWeek}:${f.startTime}`));

      res.json({
        ok: true,
        origen: lectura.origen,
        avisos: lectura.avisos,
        sesiones: lectura.sesiones.map(sesion => ({
          ...sesion,
          materiaExiste: codigosExistentes.has(sesion.codigo),
          franjaExiste: franjasExistentes.has(`${sesion.dia}:${sesion.horaInicio}`),
        })),
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * Escribe lo revisado: crea la materia si falta (con su grupo del reporte) y
 * la franja del horario. Idempotente sobre la clave única de la franja
 * (materia, día, hora, docente): confirmar dos veces no duplica clases.
 */
scheduleRouter.post('/import/confirm', requireRole('ADMIN', 'PROFESSOR'), async (req, res, next) => {
  try {
    const body = z.object({
      period: z.string().min(4),
      sesiones: z
        .array(
          z.object({
            codigo: z.string().min(2).max(12),
            nombre: z.string().min(1).max(120),
            grupo: z.string().max(12).default(''),
            dia: z.number().int().min(1).max(7),
            horaInicio: z.string().regex(/^\d{2}:\d{2}$/),
            horaFin: z.string().regex(/^\d{2}:\d{2}$/),
            aula: z.string().max(60).default(''),
          }),
        )
        .min(1)
        .max(60),
    }).parse(req.body);

    const teacherId = req.user!.id;

    /**
     * Cuatro consultas, no trescientas.
     *
     * Esto era un `for` sobre las sesiones —hasta 60— con un `findOne` de
     * materia, un `create` condicional de materia, otro de grupo, un `exists`
     * de franja y un `findOneAndUpdate`, todos **encadenados**: cada uno
     * esperaba al anterior. Contra Atlas, con unos 30 ms de ida y vuelta, son
     * cerca de nueve segundos con la petición colgada sobre una ventana que el
     * docente ya cerró.
     *
     * Es el mismo problema que `/enrollments/bulk` ya había resuelto —«un grupo
     * de 40 eran 80 viajes en serie»— y que aquí se había quedado sin arreglar.
     *
     * Van en dos fases porque la segunda depende de la primera: una franja
     * necesita el `_id` de su materia, y para las que se acaban de crear ese id
     * no existía antes del `bulkWrite`.
     */
    const codigos = [...new Set(body.sesiones.map(sesion => sesion.codigo))];
    /**
     * `bulkWrite` **no castea los ids**, a diferencia de `find()`.
     *
     * Con `teacherId` en texto, el filtro no casa con el ObjectId guardado: el
     * upsert no encuentra nada y **crea un duplicado** en vez de actualizar. No
     * da error; deja dos materias iguales y un horario con las clases
     * repetidas. Aquí lo cazó el tipado, pero solo porque el esquema declara el
     * campo — es la trampa documentada en CLAUDE.md.
     */
    const docenteId = new Types.ObjectId(teacherId);

    // ── Fase 1: materias ────────────────────────────────────────────────────
    const materiasPrevias = await SubjectModel.find({
      code: { $in: codigos },
      period: body.period,
      professorId: teacherId,
      deletedAt: null,
    })
      .select('_id code')
      .lean();
    const yaExistian = new Set(materiasPrevias.map(materia => String(materia.code)));

    // Una entrada por código, no por sesión: una materia con tres franjas
    // semanales aparece tres veces en el cuerpo y es una sola materia.
    const nuevas = codigos.filter(codigo => !yaExistian.has(codigo));
    if (nuevas.length > 0) {
      await SubjectModel.bulkWrite(
        nuevas.map(codigo => ({
          updateOne: {
            filter: { code: codigo, period: body.period, professorId: docenteId, deletedAt: null },
            update: {
              $setOnInsert: {
                code: codigo,
                name: body.sesiones.find(sesion => sesion.codigo === codigo)!.nombre,
                period: body.period,
                professorId: docenteId,
                credits: 0,
              },
            },
            upsert: true,
          },
        })),
        { ordered: false },
      );
    }

    // Se releen para tener el `_id` de las recién creadas: `bulkWrite` no
    // devuelve los documentos, solo el recuento.
    const materias = await SubjectModel.find({
      code: { $in: codigos },
      period: body.period,
      professorId: teacherId,
      deletedAt: null,
    })
      .select('_id code')
      .lean();
    const idPorCodigo = new Map(materias.map(materia => [String(materia.code), materia._id]));
    const materiasCreadas = materias.filter(materia => !yaExistian.has(String(materia.code))).length;

    // ── Fase 2: grupos de las materias nuevas ───────────────────────────────
    // El grupo nace con la materia, con el nombre del reporte (A194) o el
    // código si el PDF no lo trajo: sin grupo no se puede matricular.
    if (nuevas.length > 0) {
      await GroupModel.bulkWrite(
        nuevas.map(codigo => {
          const sesion = body.sesiones.find(s => s.codigo === codigo)!;
          const subjectId = idPorCodigo.get(codigo)!;
          return {
            updateOne: {
              filter: { subjectId, professorId: docenteId, period: body.period, deletedAt: null },
              update: {
                $setOnInsert: {
                  name: sesion.grupo || sesion.codigo,
                  subjectId,
                  professorId: docenteId,
                  period: body.period,
                },
              },
              upsert: true,
            },
          };
        }),
        { ordered: false },
      );
    }

    // ── Fase 3: franjas ─────────────────────────────────────────────────────
    const claves = body.sesiones.map(sesion => ({
      subjectId: idPorCodigo.get(sesion.codigo)!,
      dayOfWeek: sesion.dia,
      startTime: sesion.horaInicio,
      teacherId: docenteId,
    }));

    const franjasPrevias = await ScheduleModel.find({ $or: claves }).select('subjectId dayOfWeek startTime').lean();
    const claveDeFranja = (subjectId: unknown, dia: number, hora: string) =>
      `${String(subjectId)}|${dia}|${hora}`;
    const existentes = new Set(
      franjasPrevias.map(f => claveDeFranja(f.subjectId, Number(f.dayOfWeek), String(f.startTime))),
    );

    await ScheduleModel.bulkWrite(
      body.sesiones.map((sesion, i) => ({
        updateOne: {
          filter: claves[i]!,
          update: {
            $set: {
              endTime: sesion.horaFin,
              durationMinutes: minutosDe(sesion.horaInicio, sesion.horaFin),
              classroom: sesion.aula,
              modality: /remot|virtual/i.test(sesion.aula) ? 'VIRTUAL' : 'PRESENTIAL',
              deletedAt: null,
            },
          },
          upsert: true,
        },
      })),
      { ordered: false },
    );

    const franjasCreadas = body.sesiones.filter(
      (sesion, i) => !existentes.has(claveDeFranja(claves[i]!.subjectId, sesion.dia, sesion.horaInicio)),
    ).length;
    const franjasActualizadas = body.sesiones.length - franjasCreadas;

    // Los avisos van juntos y al final, no uno por sesión dentro del bucle:
    // importar un horario de 20 franjas emitía 40 eventos de socket, y cada uno
    // hace que el cliente invalide su caché y vuelva a consultar.
    for (const codigo of nuevas) {
      emitToUser(teacherId, 'sync:update', { entity: 'subject', action: 'create', id: String(idPorCodigo.get(codigo)) });
    }
    if (nuevas.length > 0) emitToUser(teacherId, 'sync:update', { entity: 'group', action: 'bulk', id: body.period });
    emitToUser(teacherId, 'sync:update', { entity: 'schedule', action: 'bulk', id: body.period });

    await avisarCambioDeHorario(teacherId, req.user?.id, 'Se importó tu horario del semestre.');
    res.status(201).json({
      ok: true,
      materiasCreadas,
      franjasCreadas,
      franjasActualizadas,
    });
  } catch (err) {
    next(err);
  }
});
