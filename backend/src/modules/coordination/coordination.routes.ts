import { Router } from 'express';
import { z } from 'zod';
import * as campo from '../../shared/validation.js';
import { identificar, requireRole } from '../../middlewares/auth.js';
import { PROGRAMAS, buscarPrograma } from '../../domains/catalog/uts.js';
import { ALCANCE_TOTAL } from '../../domains/scope/program-scope.js';
import { cargarPanorama } from './coordination.service.js';
import { enviarPanoramaExcel } from './coordination.renderer.js';

/**
 * Vista de coordinación: las carreras a cargo, de punta a punta.
 *
 * Todo lo que hay aquí es **lectura**, y por eso secretaría entra a lo mismo
 * sin ninguna excepción escrita en este archivo: `requireRole` ya sabe que
 * secretaría vale como coordinación cuando el método no escribe
 * (`domains/scope/role-access.ts`).
 *
 * Las rutas no tocan modelos: le piden el panorama al servicio. Es el molde de
 * `reports/`, y aquí importa más que en otros sitios porque el acotado por
 * programa es justo lo que hay que poder probar sin levantar la API.
 */
export const coordinationRouter = Router();

coordinationRouter.use(identificar);
coordinationRouter.use(requireRole('ADMIN', 'COORDINATOR'));

const consulta = z.object({
  period: campo.codigo.min(4).optional(),
  programa: campo.codigo.optional(),
  q: z.string().trim().max(120).optional(),
});

/**
 * Qué programas puede mirar quien consulta.
 *
 * Lo pide la pantalla para dibujar el selector. Devolverlo entero para todos
 * convertiría el desplegable en una lista de carreras que al elegirlas dan
 * vacío, que es peor que no ofrecerlas.
 */
coordinationRouter.get('/programas', async (req, res, next) => {
  try {
    const alcance = req.alcance ?? ALCANCE_TOTAL;
    const items = alcance.total
      ? PROGRAMAS.map(programa => ({ ...programa }))
      : alcance.programas
          .map(id => buscarPrograma(id))
          .filter((programa): programa is NonNullable<typeof programa> => Boolean(programa));

    res.json({ ok: true, items, alcanceTotal: alcance.total });
  } catch (err) {
    next(err);
  }
});

/** Cifras por programa para las tarjetas de cabecera. */
coordinationRouter.get('/resumen', async (req, res, next) => {
  try {
    const query = consulta.parse(req.query);
    const panorama = await cargarPanorama(query, req.alcance ?? ALCANCE_TOTAL);
    res.json({ ok: true, periodo: panorama.periodo, ...panorama.resumen });
  } catch (err) {
    next(err);
  }
});

/** Materias del alcance, cada una con **su docente** y cómo va el curso. */
coordinationRouter.get('/materias', async (req, res, next) => {
  try {
    const query = consulta.parse(req.query);
    const panorama = await cargarPanorama(query, req.alcance ?? ALCANCE_TOTAL);
    res.json({ ok: true, items: panorama.materias, total: panorama.materias.length });
  } catch (err) {
    next(err);
  }
});

/** Docentes del alcance, con las materias que dictan en él. */
coordinationRouter.get('/docentes', async (req, res, next) => {
  try {
    const query = consulta.parse(req.query);
    const panorama = await cargarPanorama(query, req.alcance ?? ALCANCE_TOTAL);
    res.json({ ok: true, items: panorama.docentes, total: panorama.docentes.length });
  } catch (err) {
    next(err);
  }
});

/** Grupos del alcance. Es la pregunta original: «todos los grupos de mi carrera». */
coordinationRouter.get('/grupos', async (req, res, next) => {
  try {
    const query = consulta.parse(req.query);
    const panorama = await cargarPanorama(query, req.alcance ?? ALCANCE_TOTAL);
    res.json({ ok: true, items: panorama.grupos, total: panorama.grupos.length });
  } catch (err) {
    next(err);
  }
});

/**
 * Exportable: un libro con las tres hojas.
 *
 * Es `GET` y no `POST` a propósito, más allá de la semántica: exportar es
 * leer, y un `POST` habría quedado del lado prohibido del guardián de solo
 * lectura — secretaría podría ver la tabla en pantalla y no descargarla, que es
 * justo la mitad de su trabajo.
 */
coordinationRouter.get('/export.xlsx', async (req, res, next) => {
  try {
    const query = consulta.parse(req.query);
    const panorama = await cargarPanorama(query, req.alcance ?? ALCANCE_TOTAL);
    const sufijo = query.period ? `-${query.period}` : '';
    await enviarPanoramaExcel(res, panorama, `coordinacion${sufijo}.xlsx`);
  } catch (err) {
    next(err);
  }
});
