import { Router } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { identificar, requireRole } from '../../middlewares/auth.js';
import {
  MINUTOS_MAX,
  MINUTOS_MIN,
  MINUTOS_POR_DEFECTO,
} from '../../domains/attendance/qr-session.js';
import * as servicio from './attendance-qr.service.js';

/**
 * Asistencia por QR: el docente abre la clase y la proyecta; los estudiantes
 * la escanean desde UniPlanner.
 *
 * Valida, autoriza, delega y responde. **No hay ninguna ruta para el
 * estudiante**: su marca no entra por aquí sino por Firestore, donde las reglas
 * de UniPlanner la atan a su cuenta, y la lee el lector del servidor
 * (`attendance-qr.service.ts`). Así Nexus no expone nada nuevo hacia internet
 * ni recibe credenciales de otra aplicación.
 */
export const attendanceQrRouter = Router();
attendanceQrRouter.use(identificar);

const idMongo = z.string().refine((valor) => Types.ObjectId.isValid(valor), 'Identificador inválido');

function actorDe(req: { user?: { id: string; role: string } }) {
  return { id: String(req.user?.id ?? ''), role: String(req.user?.role ?? '') };
}

/** La sesión abierta de una materia, para retomarla si se recargó la pantalla. */
attendanceQrRouter.get('/sesiones', requireRole('ADMIN', 'PROFESSOR'), async (req, res, next) => {
  try {
    const filtro = z.object({ subjectId: idMongo.optional() }).parse(req.query);
    const items = await servicio.sesionesAbiertas(actorDe(req), filtro.subjectId);
    res.json({ ok: true, items });
  } catch (err) {
    next(err);
  }
});

/**
 * Abre la clase de hoy.
 *
 * No acepta fecha: un QR es para la clase que está ocurriendo. Pasar lista de
 * un día pasado se hace a mano, que es donde hay alguien mirando qué marca.
 */
attendanceQrRouter.post('/sesiones', requireRole('ADMIN', 'PROFESSOR'), async (req, res, next) => {
  try {
    const cuerpo = z
      .object({
        subjectId: idMongo,
        // Obligatorio siempre: la lista es de un grupo (A194), no de la materia.
        groupId: idMongo,
        scheduleId: idMongo.optional(),
        minutos: z.number().int().min(MINUTOS_MIN).max(MINUTOS_MAX).default(MINUTOS_POR_DEFECTO),
        marcarAusentes: z.boolean().default(true),
      })
      .parse(req.body ?? {});

    const actor = actorDe(req);
    const { id, existente } = await servicio.abrirSesion(cuerpo, actor);
    const item = await servicio.vistaDeSesion(id, actor);
    res.status(existente ? 200 : 201).json({ ok: true, existente, item });
  } catch (err) {
    next(err);
  }
});

attendanceQrRouter.get('/sesiones/:id', requireRole('ADMIN', 'PROFESSOR'), async (req, res, next) => {
  try {
    const id = idMongo.parse(req.params.id);
    res.json({ ok: true, item: await servicio.vistaDeSesion(id, actorDe(req)) });
  } catch (err) {
    next(err);
  }
});

/** El QR vigente. La pantalla lo pide otra vez cuando dice `refrescarEnMs`. */
attendanceQrRouter.get('/sesiones/:id/qr', requireRole('ADMIN', 'PROFESSOR'), async (req, res, next) => {
  try {
    const id = idMongo.parse(req.params.id);
    res.json({ ok: true, ...(await servicio.qrVigente(id, actorDe(req))) });
  } catch (err) {
    next(err);
  }
});

attendanceQrRouter.post('/sesiones/:id/cerrar', requireRole('ADMIN', 'PROFESSOR'), async (req, res, next) => {
  try {
    const id = idMongo.parse(req.params.id);
    const actor = actorDe(req);
    await servicio.cerrarSesion(id, actor);
    res.json({ ok: true, item: await servicio.vistaDeSesion(id, actor) });
  } catch (err) {
    next(err);
  }
});
