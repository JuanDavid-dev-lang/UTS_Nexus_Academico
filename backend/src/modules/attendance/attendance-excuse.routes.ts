/**
 * Excusas de inasistencia: `PUT|DELETE /attendance/:id/excusa`.
 *
 * Las registra quien recibe el soporte (docente, coordinación o ADMIN) sobre
 * una falta ya marcada. No hay ruta para el estudiante: la excusa se entrega
 * en persona y quien la acepta es quien la escribe. Qué cuenta una falta
 * justificada lo decide el dominio (`calcularAsistencia`, `detectarPatrones`).
 */
import { Router } from 'express';
import { z } from 'zod';
import { identificar, requireRole } from '../../middlewares/auth.js';
import { MOTIVOS_EXCUSA, motivoParaNoJustificar } from '../../domains/attendance/excusa.js';
import * as campo from '../../shared/validation.js';
import { auditChange } from '../../shared/audit.js';
import { emitToUser } from '../../shared/socket.js';
import { exigirPeriodoAbierto } from '../../shared/period-guard.js';
import { guardarExcusa, puedeGestionarExcusa, registroDeAsistencia } from './attendance-excuse.service.js';

export const attendanceExcuseRouter = Router();

attendanceExcuseRouter.use(identificar);

const cuerpoExcusa = z.object({
  motivo: z.enum(MOTIVOS_EXCUSA),
  detalle: campo.nota.default(''),
});

/** Carga el registro y comprueba alcance y periodo; responde el error si no procede. */
async function registroEditable(req: any, res: any) {
  const registro = await registroDeAsistencia(String(req.params.id));
  if (!registro) {
    res.status(404).json({ ok: false, message: 'Registro de asistencia no encontrado' });
    return null;
  }
  if (!(await puedeGestionarExcusa(req.user, req.alcance, registro))) {
    // 404 y no 403: decir que existe ya es información sobre un estudiante ajeno.
    res.status(404).json({ ok: false, message: 'Registro de asistencia no encontrado' });
    return null;
  }
  // La asistencia entra en la fotografía del cierre: justificar después la desmiente.
  await exigirPeriodoAbierto(registro.period, 'attendance');
  return registro;
}

attendanceExcuseRouter.put('/:id/excusa', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'), async (req, res, next) => {
  try {
    const body = cuerpoExcusa.parse(req.body);
    const registro = await registroEditable(req, res);
    if (!registro) return;

    const motivo = motivoParaNoJustificar(registro, body);
    if (motivo) return res.status(409).json({ ok: false, codigo: 'NO_JUSTIFICABLE', message: motivo });

    const item = await guardarExcusa(String(registro._id), { ...body, registradaPor: String(req.user?.id) });
    await auditChange({
      actorId: req.user?.id,
      action: registro.excusa ? 'UPDATE' : 'EXCUSA',
      entity: 'Asistencia',
      entityId: String(registro._id),
      before: { excusa: registro.excusa ?? null },
      after: { excusa: item?.excusa ?? null },
    });
    emitToUser(String(registro.teacherId), 'sync:update', { entity: 'attendance', action: 'update', id: String(registro._id) });
    res.json({ ok: true, item });
  } catch (err) {
    next(err);
  }
});

attendanceExcuseRouter.delete('/:id/excusa', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'), async (req, res, next) => {
  try {
    const registro = await registroEditable(req, res);
    if (!registro) return;
    if (!registro.excusa) return res.json({ ok: true, item: registro });

    const item = await guardarExcusa(String(registro._id), null);
    await auditChange({
      actorId: req.user?.id,
      action: 'EXCUSA_RETIRADA',
      entity: 'Asistencia',
      entityId: String(registro._id),
      before: { excusa: registro.excusa },
      after: { excusa: null },
    });
    emitToUser(String(registro.teacherId), 'sync:update', { entity: 'attendance', action: 'update', id: String(registro._id) });
    res.json({ ok: true, item });
  } catch (err) {
    next(err);
  }
});
