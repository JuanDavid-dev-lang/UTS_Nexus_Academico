import { Router } from 'express';
import { z } from 'zod';
import * as campo from '../../shared/validation.js';
import { identificar, requireRole, exigirSesion } from '../../middlewares/auth.js';
import { esPeriodoValido } from '../../domains/periods/period-lifecycle.js';
import * as servicio from './period.service.js';

/**
 * Periodos académicos.
 *
 * Cumple el molde del proyecto: aquí solo se valida, se autoriza, se delega y
 * se responde. Ni un modelo importado, ni una consulta.
 */
export const periodRouter = Router();
periodRouter.use(identificar);

/** Periodo con forma válida. Un `2026-9` crea un semestre fantasma silencioso. */
const periodo = z
  .string()
  .trim()
  .refine(esPeriodoValido, 'El periodo debe tener la forma AAAA-N (por ejemplo 2026-1).');

/**
 * Listado. Lo puede ver cualquier sesión: el selector de periodo del móvil y
 * del escritorio necesita saber cuáles hay y cuáles están cerrados para no
 * ofrecer guardar en uno bloqueado.
 *
 * @openapi
 * /periods:
 *   get:
 *     tags: [Periodos]
 *     summary: Periodos académicos con su estado
 *     description: >
 *       Une los periodos registrados con los que solo existen porque hay datos
 *       con esa cadena. Los históricos salen como `implicito: true` y en estado
 *       `OPEN`: exigirles un documento retroactivamente dejaría la aplicación
 *       en solo lectura el día del despliegue.
 *     responses:
 *       200:
 *         description: Lista de periodos
 *       401:
 *         description: Sin sesión
 */
periodRouter.get('/', exigirSesion, async (_req, res, next) => {
  try {
    res.json({ ok: true, items: await servicio.listarPeriodos() });
  } catch (err) {
    next(err);
  }
});

periodRouter.get('/:period', exigirSesion, async (req, res, next) => {
  try {
    const clave = periodo.parse(String(req.params.period));
    res.json({ ok: true, item: await servicio.obtenerPeriodo(clave) });
  } catch (err) {
    next(err);
  }
});

/**
 * Inicia o retoma el cierre. Solo administración: cerrar un semestre bloquea
 * las notas de todos los docentes de la institución.
 *
 * @openapi
 * /periods/{period}/cierre:
 *   post:
 *     tags: [Periodos]
 *     summary: Cierra (o retoma el cierre de) un periodo
 *     description: >
 *       Idempotente y reanudable. Marca `CLOSING`, genera la fotografía con
 *       `computeAcademicRecords()` y solo entonces marca `CLOSED`. Un fallo a
 *       mitad deja el periodo en `CLOSING`: bloqueado pero honesto, nunca
 *       cerrado con la fotografía incompleta.
 *     parameters:
 *       - in: path
 *         name: period
 *         required: true
 *         schema: { type: string, example: '2026-1' }
 *     responses:
 *       200:
 *         description: Periodo cerrado, con el resumen de la fotografía
 *       400:
 *         description: El periodo no tiene la forma AAAA-N
 *       403:
 *         description: Solo ADMIN o COORDINATOR
 *       409:
 *         description: El periodo ya estaba cerrado
 */
periodRouter.post('/:period/cierre', requireRole('ADMIN', 'COORDINATOR'), async (req, res, next) => {
  try {
    const clave = periodo.parse(String(req.params.period));
    const resultado = await servicio.cerrarPeriodo(clave, {
      id: req.user!.id,
      role: req.user!.role,
    });
    res.json({ ok: true, ...resultado });
  } catch (err) {
    next(err);
  }
});

/** Aborta un cierre atascado en `CLOSING` y devuelve el periodo a `OPEN`. */
periodRouter.post('/:period/cierre/abortar', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const clave = periodo.parse(String(req.params.period));
    res.json({ ok: true, item: await servicio.abortarCierre(clave, { id: req.user!.id }) });
  } catch (err) {
    next(err);
  }
});

/**
 * Reapertura. Solo ADMIN y con motivo obligatorio: es la única operación que
 * puede hacer que un acta oficial deje de coincidir con lo que se consultó,
 * así que tiene que quedar dicho por qué.
 *
 * @openapi
 * /periods/{period}/reapertura:
 *   post:
 *     tags: [Periodos]
 *     summary: Reabre un periodo cerrado
 *     description: >
 *       La fotografía anterior NO se borra: se anota autor, fecha, motivo y la
 *       versión que quedó congelada, que es lo único que permite explicar por
 *       qué un consolidado histórico cambió.
 *     parameters:
 *       - in: path
 *         name: period
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [motivo]
 *             properties:
 *               motivo: { type: string, minLength: 10, maxLength: 500 }
 *     responses:
 *       200: { description: Periodo reabierto }
 *       400: { description: Motivo demasiado corto }
 *       403: { description: Solo ADMIN }
 *       409: { description: El periodo ya estaba abierto }
 */
periodRouter.post('/:period/reapertura', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const clave = periodo.parse(String(req.params.period));
    const { motivo } = z.object({ motivo: campo.nota.min(10) }).parse(req.body);
    res.json({ ok: true, item: await servicio.reabrirPeriodo(clave, { id: req.user!.id }, motivo) });
  } catch (err) {
    next(err);
  }
});

/**
 * Fotografía congelada.
 *
 * Un docente solo ve la suya: el `teacherId` se impone desde la sesión
 * **después** de leer los filtros de la URL, nunca se acepta del cliente.
 *
 * @openapi
 * /periods/{period}/fotografia:
 *   get:
 *     tags: [Periodos]
 *     summary: Consolidado congelado en el cierre
 *     description: >
 *       Un registro por (estudiante, materia). No se recalcula al leerlo: es
 *       una copia de lo que la pipeline canónica respondió en el instante del
 *       cierre. El alcance del rol se aplica DESPUÉS de los filtros de la URL.
 *     parameters:
 *       - in: path
 *         name: period
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: subjectId
 *         schema: { type: string }
 *       - in: query
 *         name: studentId
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Fotografía paginada
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/RespuestaPaginada' }
 */
periodRouter.get('/:period/fotografia', exigirSesion, async (req, res, next) => {
  try {
    const clave = periodo.parse(String(req.params.period));
    const consulta = z
      .object({ subjectId: z.string().optional(), studentId: z.string().optional() })
      .parse(req.query);
    const pagina = campo.paginacionCon(500).parse(req.query);

    const usuario = req.user!;
    const filtro: servicio.FiltroFotografia = { period: clave, ...consulta };
    if (usuario.role === 'PROFESSOR') filtro.teacherId = usuario.id;
    if (usuario.role === 'STUDENT') {
      // Sin ficha vinculada la consulta se cierra a nada, no se abre a todos.
      filtro.studentId = usuario.studentId ?? '000000000000000000000000';
    }

    const { items, total } = await servicio.consultarFotografia(filtro, pagina);
    res.json(campo.respuestaPaginada(items, total, pagina));
  } catch (err) {
    next(err);
  }
});

periodRouter.get('/:period/fotografia/resumen', exigirSesion, async (req, res, next) => {
  try {
    const clave = periodo.parse(String(req.params.period));
    const usuario = req.user!;
    const soloSuyo = usuario.role === 'PROFESSOR' ? usuario.id : undefined;
    res.json({ ok: true, item: await servicio.resumenFotografia(clave, soloSuyo) });
  } catch (err) {
    next(err);
  }
});
