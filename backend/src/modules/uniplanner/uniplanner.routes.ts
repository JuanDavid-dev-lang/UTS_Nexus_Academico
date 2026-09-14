import { Router } from 'express';
import { z } from 'zod';
import * as campo from '../../shared/validation.js';
import { identificar, requireRole } from '../../middlewares/auth.js';
import { limiteLotes } from '../../middlewares/rate-limit.js';
import { esFechaReal } from '../../domains/uniplanner/message.js';
import * as servicio from './uniplanner.service.js';
import * as vinculos from './vinculos.service.js';
import { dentroDelAlcanceDePrograma, type AlcanceDePrograma } from '../../domains/scope/program-scope.js';

/**
 * Puente con UniPlanner: avisar a un estudiante en su propia app.
 *
 * Valida, autoriza, delega y responde. Lo que se manda lo compone el dominio
 * (`domains/uniplanner/`) y lo escribe `shared/uniplanner.ts`.
 *
 * **Ninguna ruta acepta el dato que se va a publicar.** El cuerpo dice a quién
 * y de qué materia; las faltas, la nota y el horario se leen de la base. Es la
 * diferencia entre «avisa de lo que hay» y «escribe esto en la app de esa
 * persona», y la segunda no es una función que deba existir.
 *
 * **El alcance del docente se impone aquí**, después de leer la URL: un
 * PROFESSOR solo puede nombrar sus propias matrículas, y `teacherId` no viene
 * del cliente sino de la sesión.
 */
export const uniplannerRouter = Router();
uniplannerRouter.use(identificar);

/** Solo se fuerza el alcance cuando quien llama es docente. */
function alcanceDe(req: { user?: { id: string; role: string } }): string | undefined {
  return req.user?.role === 'PROFESSOR' ? req.user.id : undefined;
}

/**
 * Coordinación y secretaría, por programa: una materia de otra carrera —o de
 * otra universidad— responde 404, igual que al leerla. El docente se acota con
 * `alcanceDe` en el servicio; ADMIN no se acota.
 */
function materiaFueraDelAlcance(req: { alcance?: AlcanceDePrograma }, subjectId: string): boolean {
  return Boolean(req.alcance) && !dentroDelAlcanceDePrograma(req.alcance!, 'subjectIds', subjectId);
}

function fueraDelAlcance(res: { status: (codigo: number) => { json: (cuerpo: unknown) => unknown } }) {
  return res.status(404).json({ ok: false, message: 'Esa materia no está en tu alcance.' });
}

function actorDe(req: {
  user?: { id: string };
  ip?: string;
  headers: Record<string, unknown>;
}) {
  return {
    id: String(req.user?.id ?? ''),
    ip: req.ip ?? null,
    userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
  };
}

/**
 * Si el canal está encendido.
 *
 * La UI lo consulta antes de pintar nada: sin credenciales configuradas no hay
 * insignias ni botón de avisar, y enseñar un botón que no puede funcionar es
 * peor que no enseñarlo.
 */
uniplannerRouter.get('/estado', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR', 'SECRETARY'), (_req, res) => {
  res.json({ ok: true, ...servicio.estadoDelCanal() });
});

/** Qué estudiantes de una materia tienen UniPlanner. Una lectura para la lista. */
uniplannerRouter.get(
  '/enlaces',
  requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'),
  async (req, res, next) => {
    try {
      const filtro = z
        .object({
          subjectId: z.string().min(1),
          period: z.string().max(20).optional(),
        })
        .parse(req.query);
      if (materiaFueraDelAlcance(req, filtro.subjectId)) return fueraDelAlcance(res);

      const items = await servicio.estadoDeEnlaces({ ...filtro, teacherId: alcanceDe(req) });
      res.json({ ok: true, items });
    } catch (err) {
      next(err);
    }
  },
);

// ── Vínculos: gestión institucional ─────────────────────────────────────────
//
// El enlace es de la persona con su universidad, no de un curso, así que lo
// gestiona administración o coordinación —secretaría lo consulta— y no el
// docente de una materia. Detalle en `vinculos.service.ts`.

const idDeEnlace = z.string().regex(/^[a-z0-9_-]{1,40}__[A-Z0-9]{4,32}$/, 'Identificador de enlace inválido');
const claveInstitucion = z.string().regex(/^[a-z0-9_-]{1,40}$/, 'Institución inválida');

function actorConRol(req: {
  user?: { id: string; role: string };
  ip?: string;
  headers: Record<string, unknown>;
}) {
  return { ...actorDe(req), role: String(req.user?.role ?? '') };
}

/** Las universidades que quien consulta puede gestionar, para el selector. */
uniplannerRouter.get(
  '/vinculos/instituciones',
  requireRole('ADMIN', 'COORDINATOR', 'SECRETARY'),
  async (req, res, next) => {
    try {
      res.json({ ok: true, items: await vinculos.institucionesGestionables(actorConRol(req), req.alcance) });
    } catch (err) {
      next(err);
    }
  },
);

uniplannerRouter.get('/vinculos', requireRole('ADMIN', 'COORDINATOR', 'SECRETARY'), async (req, res, next) => {
  try {
    const filtro = z
      .object({
        institucion: claveInstitucion,
        filtro: z.enum(['todos', 'sin-verificar', 'verificados', 'fijos']).default('todos'),
        q: z.string().trim().max(80).optional(),
        despuesDe: z.string().max(400).optional(),
      })
      .parse(req.query);
    const pagina = await vinculos.listarVinculos(filtro, actorConRol(req), req.alcance);
    res.json({ ok: true, ...pagina });
  } catch (err) {
    next(err);
  }
});

uniplannerRouter.post(
  '/vinculos/:linkId/acciones',
  requireRole('ADMIN', 'COORDINATOR'),
  async (req, res, next) => {
    try {
      const linkId = idDeEnlace.parse(req.params.linkId);
      const { accion } = z
        .object({ accion: z.enum(['verificar', 'desverificar', 'desbloquear', 'liberar']) })
        .parse(req.body ?? {});
      const item = await vinculos.cambiarVinculo(linkId, accion, actorConRol(req), req.alcance);
      res.json({ ok: true, item });
    } catch (err) {
      next(err);
    }
  },
);

uniplannerRouter.get('/solicitudes', requireRole('ADMIN', 'COORDINATOR', 'SECRETARY'), async (req, res, next) => {
  try {
    const { institucion } = z.object({ institucion: claveInstitucion }).parse(req.query);
    res.json({ ok: true, items: await vinculos.listarSolicitudes(institucion, actorConRol(req), req.alcance) });
  } catch (err) {
    next(err);
  }
});

uniplannerRouter.post(
  '/solicitudes/:uid/resolucion',
  requireRole('ADMIN', 'COORDINATOR'),
  async (req, res, next) => {
    try {
      const uid = z.string().regex(/^[A-Za-z0-9]{1,128}$/, 'Identificador inválido').parse(req.params.uid);
      const decision = z
        .object({ accion: z.enum(['desbloquear', 'liberar', 'asignar', 'rechazar']), nota: campo.nota.optional() })
        .parse(req.body ?? {});
      await vinculos.resolverSolicitud(uid, decision, actorConRol(req), req.alcance);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

const cuerpoInasistencia = z.object({
  subjectId: z.string().min(1),
  period: z.string().max(20).optional(),
  /** Vacío = a todos los que pasen del umbral. */
  studentIds: z.array(z.string().min(1)).max(servicio.TOPE_LOTE).optional(),
  desde: z.enum(['AMARILLO', 'ROJO']).optional(),
  corte: z.string().trim().max(40).optional(),
  mensaje: campo.nota.optional(),
});

/**
 * Aviso de inasistencias, individual o a los que estén en riesgo.
 *
 * Es la misma ruta para los dos casos porque son el mismo hecho: con
 * `studentIds` manda el docente —pulsó el botón de esa fila— y sin ellos manda
 * el semáforo.
 *
 * Lleva `limiteLotes` como las demás rutas masivas del backend, y por el mismo
 * motivo: una sola llamada escribe hasta ochenta documentos, y cada uno es una
 * petición a Firestore de otro proyecto. Con solo el cupo de escritura —ciento
 * veinte peticiones por cuarto de hora— una sesión podría disparar casi diez
 * mil escrituras externas en ese rato. El tope por petición acota lo que cabe
 * en una; este acota cuántas caben en una ventana.
 */
uniplannerRouter.post(
  '/avisos/inasistencia',
  requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'),
  limiteLotes,
  async (req, res, next) => {
    try {
      const cuerpo = cuerpoInasistencia.parse(req.body ?? {});
      if (materiaFueraDelAlcance(req, cuerpo.subjectId)) return fueraDelAlcance(res);
      const { resultados } = await servicio.avisarInasistencias(
        { ...cuerpo, teacherId: alcanceDe(req) },
        actorDe(req),
      );
      res.json({ ok: true, ...resumen(resultados), resultados });
    } catch (err) {
      next(err);
    }
  },
);

uniplannerRouter.post(
  '/avisos/nota',
  requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'),
  limiteLotes,
  async (req, res, next) => {
    try {
      const cuerpo = z
        .object({
          subjectId: z.string().min(1),
          corte: z.number().int().min(1).max(3),
          period: z.string().max(20).optional(),
          studentIds: z.array(z.string().min(1)).max(servicio.TOPE_LOTE).optional(),
          mensaje: campo.nota.optional(),
        })
        .parse(req.body ?? {});
      if (materiaFueraDelAlcance(req, cuerpo.subjectId)) return fueraDelAlcance(res);

      const { resultados } = await servicio.avisarNotas(
        { ...cuerpo, teacherId: alcanceDe(req) },
        actorDe(req),
      );
      res.json({ ok: true, ...resumen(resultados), resultados });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * Horario del semestre.
 *
 * Sin `PROFESSOR`: el horario es institucional y un docente solo ve su propia
 * materia, así que un envío suyo describiría un semestre de una asignatura.
 */
uniplannerRouter.post(
  '/avisos/carga',
  requireRole('ADMIN', 'COORDINATOR'),
  async (req, res, next) => {
    try {
      const cuerpo = z
        .object({
          studentId: z.string().min(1),
          period: z.string().min(1).max(20),
          subjectIds: z.array(z.string().min(1)).max(60).optional(),
          mensaje: campo.nota.optional(),
        })
        .parse(req.body ?? {});
      // El horario de un estudiante de sus carreras, y solo sus materias: el
      // resto de su carga es asunto de la coordinación que la lleva.
      if (req.alcance && !dentroDelAlcanceDePrograma(req.alcance, 'studentIds', cuerpo.studentId)) {
        return res.status(404).json({ ok: false, message: 'Ese estudiante no está en tu alcance.' });
      }
      if (req.alcance && !req.alcance.total) {
        const propias = new Set(req.alcance.subjectIds);
        cuerpo.subjectIds = (cuerpo.subjectIds ?? req.alcance.subjectIds).filter((id) => propias.has(id));
        // Vacía no puede llegar al servicio: allí una lista vacía es «todas».
        if (cuerpo.subjectIds.length === 0) return fueraDelAlcance(res);
      }

      const { resultados } = await servicio.avisarCargaAcademica(cuerpo, actorDe(req));
      res.json({ ok: true, ...resumen(resultados), resultados });
    } catch (err) {
      next(err);
    }
  },
);

uniplannerRouter.post(
  '/avisos/entrega',
  requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'),
  limiteLotes,
  async (req, res, next) => {
    try {
      const cuerpo = z
        .object({
          subjectId: z.string().min(1),
          period: z.string().max(20).optional(),
          studentIds: z.array(z.string().min(1)).max(servicio.TOPE_LOTE).optional(),
          titulo: z.string().trim().min(2).max(200),
          // `yyyy-MM-dd` y `HH:mm`: es el formato que espera el receptor, y una
          // fecha con otra forma se descarta allí sin decir nada.
          //
          // El patrón no basta. `2026-02-31` lo cumple y `Date` no se queja:
          // desborda al 3 de marzo, así que el recordatorio del estudiante
          // vencería tres días tarde sin que nada fallara en ningún lado. Se
          // comprueba que el día exista de verdad y se responde 400 a quien lo
          // escribió, que es el único momento en que hay alguien a quien
          // preguntarle.
          fecha: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .refine(esFechaReal, 'Esa fecha no existe en el calendario.')
            .optional(),
          hora: z
            .string()
            .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
            .optional(),
          mensaje: campo.nota.optional(),
        })
        .parse(req.body ?? {});
      if (materiaFueraDelAlcance(req, cuerpo.subjectId)) return fueraDelAlcance(res);

      const { resultados } = await servicio.avisarEntrega(
        { ...cuerpo, teacherId: alcanceDe(req) },
        actorDe(req),
      );
      res.json({ ok: true, ...resumen(resultados), resultados });
    } catch (err) {
      next(err);
    }
  },
);

/** Cuántos recibieron y cuántos no, para que la UI no tenga que contarlo. */
function resumen(resultados: servicio.ResultadoDestinatario[]) {
  const enviados = resultados.filter((r) => r.enviado).length;
  return { total: resultados.length, enviados, omitidos: resultados.length - enviados };
}
