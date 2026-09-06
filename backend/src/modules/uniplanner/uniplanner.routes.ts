import { Router } from 'express';
import { z } from 'zod';
import * as campo from '../../shared/validation.js';
import { identificar, requireRole } from '../../middlewares/auth.js';
import { limiteLotes } from '../../middlewares/rate-limit.js';
import { esFechaReal } from '../../domains/uniplanner/message.js';
import * as servicio from './uniplanner.service.js';

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

      const items = await servicio.estadoDeEnlaces({ ...filtro, teacherId: alcanceDe(req) });
      res.json({ ok: true, items });
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
