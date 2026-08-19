import { Router } from 'express';
import { identificar, requireRole } from '../../middlewares/auth.js';
import { estadoDelSistema } from './health.service.js';

/**
 * Salud profunda del sistema.
 *
 * Va autenticada y solo para administración. `/health` sigue siendo la sonda
 * pública, mínima y sin detalles: un balanceador necesita saber si el proceso
 * responde, no qué integraciones hay configuradas. Contar eso sin sesión sería
 * regalar el mapa de la instalación a cualquiera que pruebe la URL.
 */
export const healthRouter = Router();
healthRouter.use(identificar);
healthRouter.use(requireRole('ADMIN', 'COORDINATOR'));

/**
 * @openapi
 * /system/health:
 *   get:
 *     tags: [Administración]
 *     summary: Estado profundo del sistema
 *     description: >
 *       Integraciones (MongoDB, ML, SMTP, FCM, versiones) con cuatro estados
 *       —desactivado, configurado, saludable, con error— y las tareas
 *       periódicas leídas de la base, no de la memoria del proceso. Ningún
 *       mensaje incluye secretos ni cadenas de conexión. `/health` (fuera de
 *       `/api/v1`) sigue siendo la sonda pública y mínima.
 *     responses:
 *       200: { description: Estado del sistema }
 *       403: { description: Solo ADMIN o COORDINATOR }
 */
healthRouter.get('/', async (_req, res, next) => {
  try {
    res.json({ ok: true, ...(await estadoDelSistema()) });
  } catch (err) {
    next(err);
  }
});
