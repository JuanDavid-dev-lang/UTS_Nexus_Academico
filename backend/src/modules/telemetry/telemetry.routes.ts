import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import * as campo from '../../shared/validation.js';
import { identificar, exigirSesion, requireRole } from '../../middlewares/auth.js';
import { LIMITES } from '../../shared/sanitize.js';
import * as servicio from './telemetry.service.js';

/**
 * Telemetría de errores de clientes.
 *
 * El alta la puede hacer cualquier sesión —el error lo sufre quien lo sufre—;
 * la lectura y la gestión, solo administración.
 */
export const telemetryRouter = Router();
telemetryRouter.use(identificar);

/**
 * Límite propio y estricto para el alta.
 *
 * El límite general de la API son 250 peticiones cada 15 minutos, y una
 * pantalla que falla en bucle las gasta en segundos: el cliente se quedaría
 * sin poder hacer nada más, justo cuando ya está roto. Con un cupo aparte, la
 * telemetría se agota sola sin llevarse por delante el resto de la sesión.
 *
 * Treinta por ventana es generoso para reportar defectos distintos y muy corto
 * para un bucle: el cliente además deduplica antes de enviar.
 */
const limiteDeAlta = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, message: 'Demasiados reportes de error. Se reanudará en unos minutos.' },
});

const reporte = z.object({
  client: z.enum(['desktop', 'mobile']),
  appVersion: z.string().trim().max(40).optional(),
  platform: z.string().trim().max(40).optional(),
  route: z.string().trim().max(200).optional(),
  category: z.enum(['render', 'network', 'runtime', 'unhandled', 'promise', 'otro']).optional(),
  // Los topes vienen de `shared/sanitize.ts`, no escritos a mano aquí: un
  // `z.string()` sin `.max()` deja entrar dos megabytes que además se guardan.
  message: z.string().trim().min(1).max(LIMITES.MENSAJE * 4),
  context: z.string().trim().max(LIMITES.CONTEXTO * 2).optional(),
});

/**
 * @openapi
 * /telemetry/errores:
 *   post:
 *     tags: [Administración]
 *     summary: Reporta un error de cliente
 *     description: >
 *       El usuario sale de la sesión, nunca del cuerpo. La firma que agrupa la
 *       calcula el servidor: si la decidiera el cliente, dos versiones de la
 *       aplicación agruparían distinto el mismo defecto. El mismo error no
 *       inserta un documento nuevo, incrementa el contador. Límite propio de 30
 *       reportes cada 5 minutos.
 *     responses:
 *       201: { description: Registrado, con su firma y número de ocurrencias }
 *       400: { description: Cuerpo inválido }
 *       429: { description: Demasiados reportes }
 */
telemetryRouter.post('/errores', exigirSesion, limiteDeAlta, async (req, res, next) => {
  try {
    const body = reporte.parse(req.body);
    // El usuario sale de la sesión, nunca del cuerpo.
    const resultado = await servicio.registrarError(body, { id: req.user!.id });
    res.status(201).json({ ok: true, ...resultado });
  } catch (err) {
    next(err);
  }
});

telemetryRouter.get('/errores', requireRole('ADMIN', 'COORDINATOR'), async (req, res, next) => {
  try {
    const filtro = z
      .object({
        client: z.enum(['desktop', 'mobile']).optional(),
        category: z.enum(['render', 'network', 'runtime', 'unhandled', 'promise', 'otro']).optional(),
        status: z.enum(['ABIERTO', 'RESUELTO', 'IGNORADO']).optional(),
        appVersion: z.string().max(40).optional(),
        q: campo.linea.optional(),
      })
      .parse(req.query);
    const pagina = campo.paginacionCon(100).parse(req.query);

    const { items, total } = await servicio.listar(filtro, pagina);
    res.json(campo.respuestaPaginada(items, total, pagina));
  } catch (err) {
    next(err);
  }
});

telemetryRouter.get('/errores/resumen', requireRole('ADMIN', 'COORDINATOR'), async (_req, res, next) => {
  try {
    res.json({ ok: true, ...(await servicio.resumen()) });
  } catch (err) {
    next(err);
  }
});

telemetryRouter.patch('/errores/:id', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const { estado } = z
      .object({ estado: z.enum(['ABIERTO', 'RESUELTO', 'IGNORADO']) })
      .parse(req.body);
    const item = await servicio.cambiarEstado(String(req.params.id), estado, req.user!.id);
    res.json({ ok: true, item });
  } catch (err) {
    next(err);
  }
});

telemetryRouter.delete('/errores/:id', requireRole('ADMIN'), async (req, res, next) => {
  try {
    await servicio.eliminar(String(req.params.id));
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/** Purga manual de lo resuelto y antiguo, según `TELEMETRY_RETENTION_DAYS`. */
telemetryRouter.post('/errores/purga', requireRole('ADMIN'), async (_req, res, next) => {
  try {
    res.json({ ok: true, eliminados: await servicio.purgar() });
  } catch (err) {
    next(err);
  }
});
