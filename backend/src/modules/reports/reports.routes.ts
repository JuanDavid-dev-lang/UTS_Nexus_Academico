import { Router } from 'express';
import ExcelJS from 'exceljs';
import { identificar, requireRole } from '../../middlewares/auth.js';
import { ConfigModel } from '../../models/config.model.js';
import { auditChange } from '../../shared/audit.js';
import { emitSync } from '../../shared/socket.js';
import { CATALOGOS, construirFilas, construirFilasTexto } from './report-columns.js';
import {
  CLAVE_PLANTILLA,
  getPlantilla,
  plantillaSchema,
  resolverColumnas,
  type Plantilla,
} from './report-template.js';
import { iniciarPdf, seccion, tablaDeCatalogo, terminarPdf } from './pdf.renderer.js';
import { enviarExcel, hojaDeCatalogo } from './excel.renderer.js';
import { fechaHoraDeCampus, orientacionPara } from './report-layout.js';
import {
  detallesDelReporte,
  indicadorDeAsistencia,
  indicadoresAsistencia,
  indicadoresConsolidado,
  indicadoresNotas,
} from './report-summary.js';
import { env } from '../../shared/env.js';
import {
  buscarAsistencia,
  buscarNotas,
  ordenarNotasParaActa,
  consolidadoOrdenado,
  filtrosDeConsulta,
  resolveMaps,
  resumenGeneral,
} from './reports.service.js';

/**
 * Rutas de reportes. **Solo HTTP**: valida, autoriza, delega y responde.
 *
 * Este archivo tenía 582 líneas y hacía cuatro oficios a la vez — dibujar PDF,
 * generar Excel, consultar Mongo con cinco modelos y enrutar—, que es como
 * llegan a existir los archivos que nadie quiere abrir. Ahora el dibujo vive
 * en `pdf.renderer.ts`, las hojas en `excel.renderer.ts` y los datos en
 * `reports.service.ts`.
 *
 * La regla que lo mantiene así: **una ruta no importa un Modelo.**
 */
export const reportsRouter = Router();
reportsRouter.use(identificar);

/** Sin la sigla al final: el membrete ya dice de qué institución es. */
const TITULOS_POR_DEFECTO = {
  consolidado: 'Consolidado de notas finales',
  grades: 'Reporte de notas',
  attendance: 'Reporte de asistencia',
  combined: 'Reporte académico completo',
} as const;

function tituloDe(plantilla: Plantilla, kind: keyof typeof TITULOS_POR_DEFECTO): string {
  return plantilla.titulos[kind] ?? TITULOS_POR_DEFECTO[kind];
}

/** Las actas se imprimen, se firman y se entregan. */
const FIRMAS = ['Docente', 'Coordinación académica'];

const SIN_NOTAS = 'Sin notas registradas para los filtros elegidos.';
const SIN_ASISTENCIA = 'Sin asistencia registrada para los filtros elegidos.';

const generadoAhora = () => fechaHoraDeCampus(new Date(), env.CAMPUS_UTC_OFFSET_MIN);

reportsRouter.get('/summary', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'), async (req, res, next) => {
  try {
    // Solo el alcance de quien pregunta, nunca los filtros de la URL.
    res.json({ ok: true, summary: await resumenGeneral(filtrosDeConsulta({}, req.user, req.alcance)) });
  } catch (err) {
    next(err);
  }
});

/**
 * Plantilla de los reportes. El catálogo de columnas viaja con ella para que
 * el editor del cliente muestre exactamente las columnas que existen, sin
 * duplicar la lista.
 */
reportsRouter.get('/template', requireRole('ADMIN', 'COORDINATOR'), async (_req, res, next) => {
  try {
    const plantilla = await getPlantilla();
    res.json({
      ok: true,
      plantilla,
      columnasDisponibles: {
        consolidado: CATALOGOS.consolidado.map(c => ({ key: c.key, header: c.header })),
        grades: CATALOGOS.grades.map(c => ({ key: c.key, header: c.header })),
        attendance: CATALOGOS.attendance.map(c => ({ key: c.key, header: c.header })),
      },
    });
  } catch (err) {
    next(err);
  }
});

reportsRouter.put('/template', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const plantilla = plantillaSchema.parse(req.body);

    const antes = await ConfigModel.findOne({ key: CLAVE_PLANTILLA }).lean();
    const item = await ConfigModel.findOneAndUpdate(
      { key: CLAVE_PLANTILLA },
      { $set: { key: CLAVE_PLANTILLA, value: plantilla, deletedAt: null } },
      { upsert: true, new: true }
    );

    // Cambiar cómo se ven las actas que salen con membrete institucional es de
    // las cosas que hay que poder mirar después y saber quién la hizo.
    await auditChange({
      actorId: req.user?.id,
      action: 'UPDATE',
      entity: 'PlantillaReportes',
      entityId: item.id,
      before: antes?.value,
      after: plantilla,
    });

    emitSync('sync:update', { entity: 'reportTemplate', action: 'update', id: item.id });
    res.json({ ok: true, plantilla });
  } catch (err) {
    next(err);
  }
});

/**
 * Vista previa de la asistencia que saldría en el PDF/Excel: mismas columnas,
 * mismas filas, mismo orden — construidas por el MISMO catálogo, así que lo
 * que se ve es exactamente lo que se descarga. Cap a 300 filas para no
 * reventar la UI; `total` dice cuántas saldrían de verdad en el archivo.
 */
reportsRouter.get('/preview/attendance', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'), async (req, res, next) => {
  try {
    const filters = filtrosDeConsulta(req.query, req.user, req.alcance);
    const [attendance, plantilla] = await Promise.all([
      buscarAsistencia(filters, { date: -1 }),
      getPlantilla(),
    ]);
    // El diccionario de nombres se pide DESPUÉS de las filas, no en
    // paralelo: solo así puede acotarse a los ids que salen en ellas.
    const maps = await resolveMaps(attendance);

    const columnas = resolverColumnas(plantilla, 'attendance');
    const TOPE = 300;
    const filas = construirFilasTexto(columnas, attendance.slice(0, TOPE), maps);
    res.json({
      ok: true,
      headers: columnas.map(c => c.header),
      rows: filas,
      total: attendance.length,
      truncado: attendance.length > TOPE,
    });
  } catch (err) {
    next(err);
  }
});

reportsRouter.get('/pdf/consolidado', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'), async (req, res, next) => {
  try {
    const [records, plantilla] = await Promise.all([
      consolidadoOrdenado(req.query, req.user, req.alcance),
      getPlantilla(),
    ]);
    // El diccionario de nombres se pide DESPUÉS de las filas, no en
    // paralelo: solo así puede acotarse a los ids que salen en ellas.
    const maps = await resolveMaps(records);
    const columnas = resolverColumnas(plantilla, 'consolidado');
    const generado = generadoAhora();

    const informe = iniciarPdf(res, {
      titulo: tituloDe(plantilla, 'consolidado'),
      archivo: 'consolidado-notas.pdf',
      plantilla,
      orientacion: orientacionPara([columnas.map(c => c.pdfWidth)]),
      generado,
      firmas: FIRMAS,
      detalles: detallesDelReporte(filtrosDeConsulta(req.query, req.user, req.alcance), maps, generado),
      indicadores: indicadoresConsolidado(records),
    });
    tablaDeCatalogo(informe, columnas, construirFilasTexto(columnas, records, maps), SIN_NOTAS, { antesDeFirmas: true });
    terminarPdf(informe);
  } catch (err) {
    next(err);
  }
});

reportsRouter.get('/excel/consolidado', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'), async (req, res, next) => {
  try {
    const [records, plantilla] = await Promise.all([
      consolidadoOrdenado(req.query, req.user, req.alcance),
      getPlantilla(),
    ]);
    // El diccionario de nombres se pide DESPUÉS de las filas, no en
    // paralelo: solo así puede acotarse a los ids que salen en ellas.
    const maps = await resolveMaps(records);
    const columnas = resolverColumnas(plantilla, 'consolidado');

    const wb = new ExcelJS.Workbook();
    hojaDeCatalogo(wb, 'Consolidado', columnas, construirFilas(columnas, records, maps), {
      titulo: tituloDe(plantilla, 'consolidado'),
      plantilla,
      detalles: detallesDelReporte(filtrosDeConsulta(req.query, req.user, req.alcance), maps, generadoAhora()),
      indicadores: indicadoresConsolidado(records),
    }, SIN_NOTAS);

    await enviarExcel(res, wb, 'consolidado-notas.xlsx');
  } catch (err) {
    next(err);
  }
});

reportsRouter.get('/pdf/grades', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'), async (req, res, next) => {
  try {
    const filters = filtrosDeConsulta(req.query, req.user, req.alcance);
    const [grades, plantilla] = await Promise.all([
      buscarNotas(filters, { studentId: 1 }),
      getPlantilla(),
    ]);
    // El diccionario de nombres se pide DESPUÉS de las filas, no en
    // paralelo: solo así puede acotarse a los ids que salen en ellas.
    const maps = await resolveMaps(grades);
    const columnas = resolverColumnas(plantilla, 'grades');
    const generado = generadoAhora();

    const informe = iniciarPdf(res, {
      titulo: tituloDe(plantilla, 'grades'),
      archivo: 'reporte-notas.pdf',
      plantilla,
      orientacion: orientacionPara([columnas.map(c => c.pdfWidth)]),
      generado,
      firmas: FIRMAS,
      detalles: detallesDelReporte(filters, maps, generado),
      indicadores: indicadoresNotas(grades),
    });
    tablaDeCatalogo(informe, columnas, construirFilasTexto(columnas, ordenarNotasParaActa(grades, maps), maps), SIN_NOTAS, { antesDeFirmas: true });
    terminarPdf(informe);
  } catch (err) {
    next(err);
  }
});

reportsRouter.get('/pdf/attendance', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'), async (req, res, next) => {
  try {
    const filters = filtrosDeConsulta(req.query, req.user, req.alcance);
    const [attendance, plantilla] = await Promise.all([
      buscarAsistencia(filters, { date: -1 }),
      getPlantilla(),
    ]);
    // El diccionario de nombres se pide DESPUÉS de las filas, no en
    // paralelo: solo así puede acotarse a los ids que salen en ellas.
    const maps = await resolveMaps(attendance);
    const columnas = resolverColumnas(plantilla, 'attendance');
    const generado = generadoAhora();

    const informe = iniciarPdf(res, {
      titulo: tituloDe(plantilla, 'attendance'),
      archivo: 'reporte-asistencia.pdf',
      plantilla,
      orientacion: orientacionPara([columnas.map(c => c.pdfWidth)]),
      generado,
      firmas: FIRMAS,
      detalles: detallesDelReporte(filters, maps, generado),
      indicadores: indicadoresAsistencia(attendance),
    });
    tablaDeCatalogo(informe, columnas, construirFilasTexto(columnas, attendance, maps), SIN_ASISTENCIA, { antesDeFirmas: true });
    terminarPdf(informe);
  } catch (err) {
    next(err);
  }
});

reportsRouter.get('/pdf/combined', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'), async (req, res, next) => {
  try {
    const filters = filtrosDeConsulta(req.query, req.user, req.alcance);
    const [grades, attendance, plantilla] = await Promise.all([
      buscarNotas(filters, { studentId: 1, subjectId: 1 }),
      buscarAsistencia(filters, { date: -1 }),
      getPlantilla(),
    ]);
    // El diccionario de nombres se pide DESPUÉS de las filas, no en
    // paralelo: solo así puede acotarse a los ids que salen en ellas.
    const maps = await resolveMaps(grades, attendance);
    const columnasNotas = resolverColumnas(plantilla, 'grades');
    const columnasAsistencia = resolverColumnas(plantilla, 'attendance');
    const generado = generadoAhora();
    const asistencia = indicadorDeAsistencia(attendance);

    const informe = iniciarPdf(res, {
      titulo: tituloDe(plantilla, 'combined'),
      archivo: 'reporte-completo.pdf',
      plantilla,
      orientacion: orientacionPara([columnasNotas.map(c => c.pdfWidth), columnasAsistencia.map(c => c.pdfWidth)]),
      generado,
      firmas: FIRMAS,
      detalles: detallesDelReporte(filters, maps, generado),
      indicadores: [...indicadoresNotas(grades), ...(asistencia ? [asistencia] : [])],
    });

    seccion(informe, 'Notas');
    tablaDeCatalogo(informe, columnasNotas, construirFilasTexto(columnasNotas, ordenarNotasParaActa(grades, maps), maps), SIN_NOTAS);

    seccion(informe, 'Asistencia');
    tablaDeCatalogo(informe, columnasAsistencia, construirFilasTexto(columnasAsistencia, attendance, maps), SIN_ASISTENCIA, { antesDeFirmas: true });

    terminarPdf(informe);
  } catch (err) {
    next(err);
  }
});

reportsRouter.get('/excel/grades', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'), async (req, res, next) => {
  try {
    const filters = filtrosDeConsulta(req.query, req.user, req.alcance);
    const [grades, plantilla] = await Promise.all([
      buscarNotas(filters, { studentId: 1 }),
      getPlantilla(),
    ]);
    // El diccionario de nombres se pide DESPUÉS de las filas, no en
    // paralelo: solo así puede acotarse a los ids que salen en ellas.
    const maps = await resolveMaps(grades);
    const columnas = resolverColumnas(plantilla, 'grades');

    const wb = new ExcelJS.Workbook();
    hojaDeCatalogo(wb, 'Notas', columnas, construirFilas(columnas, ordenarNotasParaActa(grades, maps), maps), {
      titulo: tituloDe(plantilla, 'grades'),
      plantilla,
      detalles: detallesDelReporte(filters, maps, generadoAhora()),
      indicadores: indicadoresNotas(grades),
    }, SIN_NOTAS);

    await enviarExcel(res, wb, 'reporte-notas.xlsx');
  } catch (err) {
    next(err);
  }
});

reportsRouter.get('/excel/attendance', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'), async (req, res, next) => {
  try {
    const filters = filtrosDeConsulta(req.query, req.user, req.alcance);
    const [attendance, plantilla] = await Promise.all([
      buscarAsistencia(filters, { date: 1 }),
      getPlantilla(),
    ]);
    // El diccionario de nombres se pide DESPUÉS de las filas, no en
    // paralelo: solo así puede acotarse a los ids que salen en ellas.
    const maps = await resolveMaps(attendance);
    const columnas = resolverColumnas(plantilla, 'attendance');

    const wb = new ExcelJS.Workbook();
    hojaDeCatalogo(wb, 'Asistencia', columnas, construirFilas(columnas, attendance, maps), {
      titulo: tituloDe(plantilla, 'attendance'),
      plantilla,
      detalles: detallesDelReporte(filters, maps, generadoAhora()),
      indicadores: indicadoresAsistencia(attendance),
    }, SIN_ASISTENCIA);

    await enviarExcel(res, wb, 'reporte-asistencia.xlsx');
  } catch (err) {
    next(err);
  }
});

reportsRouter.get('/excel/combined', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'), async (req, res, next) => {
  try {
    const filters = filtrosDeConsulta(req.query, req.user, req.alcance);
    const [grades, attendance, plantilla] = await Promise.all([
      buscarNotas(filters, { studentId: 1, subjectId: 1 }),
      buscarAsistencia(filters, { date: 1 }),
      getPlantilla(),
    ]);
    // El diccionario de nombres se pide DESPUÉS de las filas, no en
    // paralelo: solo así puede acotarse a los ids que salen en ellas.
    const maps = await resolveMaps(grades, attendance);
    const columnasNotas = resolverColumnas(plantilla, 'grades');
    const columnasAsistencia = resolverColumnas(plantilla, 'attendance');
    const detalles = detallesDelReporte(filters, maps, generadoAhora());
    const titulo = tituloDe(plantilla, 'combined');

    const wb = new ExcelJS.Workbook();
    hojaDeCatalogo(wb, 'Notas', columnasNotas, construirFilas(columnasNotas, ordenarNotasParaActa(grades, maps), maps), {
      titulo: `${titulo} · Notas`,
      plantilla,
      detalles,
      indicadores: indicadoresNotas(grades),
    }, SIN_NOTAS);
    hojaDeCatalogo(wb, 'Asistencia', columnasAsistencia, construirFilas(columnasAsistencia, attendance, maps), {
      titulo: `${titulo} · Asistencia`,
      plantilla,
      detalles,
      indicadores: indicadoresAsistencia(attendance),
    }, SIN_ASISTENCIA);

    await enviarExcel(res, wb, 'reporte-academico.xlsx');
  } catch (err) {
    next(err);
  }
});
