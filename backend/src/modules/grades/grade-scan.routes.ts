import { Router } from 'express';
import multer from 'multer';
import { esExcel, excelAMatriz } from '../../shared/excel.js';
import { z } from 'zod';
import { identificar, requireRole } from '../../middlewares/auth.js';
import { emitToUser } from '../../shared/socket.js';
import {
  cruzarNotasConMatricula,
  interpretarMatrizNotas,
  type FilaNotasLeida,
} from '../../domains/grading/import-notas.js';
import {
  esReporteAcademusoft,
  interpretarReporteAcademusoft,
  type ColumnaDeNota,
  type ReporteAcademusoft,
} from '../../domains/grading/academusoft.js';
import { exigirPeriodoAbierto } from '../../shared/period-guard.js';
import { mlFetch } from '../../shared/ml-client.js';
import { elementosDeTextoPdf } from '../../shared/pdf-text.js';
import { ENTRADA_DE_ESCANER, PDF, exigirTipoReal, filtroPorMimetype } from '../../shared/uploads.js';
import { limiteLotes } from '../../middlewares/rate-limit.js';
import {
  codigoDeMateria,
  escribirLoteDeNotas,
  grupoPropio,
  matriculadosDe,
  type ColumnaDeLote,
} from './grade-import.service.js';

/**
 * Importación de calificaciones en dos pasos, con el mismo contrato que el
 * escáner de asistencia y el import de listados:
 *
 *   1. `POST /grades/import/scan` — PROPONE. Lee el archivo (Excel y el
 *      reporte de Academusoft aquí; foto u otro PDF en el servicio de
 *      visión), cruza con la matrícula y devuelve la propuesta con confianza.
 *      Nunca escribe.
 *   2. `POST /grades/bulk` — ESCRIBE lo que el docente ya revisó.
 *
 * Separar proponer de escribir no es ceremonia: una nota mal leída no da
 * error, escribe una calificación equivocada, y eso se descubre cuando el
 * consolidado reprueba a alguien que aprobó.
 */
export const gradeScanRouter = Router();
gradeScanRouter.use(identificar);

/** En memoria: el archivo se interpreta o se reenvía; nunca se guarda. */
const subirArchivo = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024, files: 1 },
  // Ver el comentario de `attendance-scan.routes.ts`: sin filtro, lo que
  // llegara acababa dentro de los parsers nativos del servicio de visión.
  fileFilter: filtroPorMimetype(
    ENTRADA_DE_ESCANER,
    'Solo se aceptan fotos (JPG, PNG, WebP), PDF o una hoja de cálculo (.xls/.xlsx).',
  ),
});

type Lectura = {
  origen: string;
  avisos: string[];
  filas: FilaNotasLeida[];
  columnas: number;
  /** Corte y componente de cada columna, cuando el archivo los dice. */
  columnasDetalle: ColumnaDeNota[] | null;
  encabezado: ReporteAcademusoft['encabezado'] | null;
};

const igualSinEspacios = (a: string, b: string) =>
  a.replace(/\s+/g, '').toUpperCase() === b.replace(/\s+/g, '').toUpperCase();

/**
 * El reporte de Academusoft dice de qué materia y grupo es. Si no casa con el
 * grupo elegido no se bloquea —el grupo puede llamarse distinto en Nexus—,
 * pero se avisa: importar el reporte de otro grupo no da error, escribe notas
 * a quien coincida por cédula.
 */
function avisosDeEncabezado(
  encabezado: ReporteAcademusoft['encabezado'],
  esperado: { codigoMateria: string | null; grupo: string },
): string[] {
  const avisos: string[] = [];
  if (
    encabezado.codigoMateria &&
    esperado.codigoMateria &&
    !igualSinEspacios(encabezado.codigoMateria, esperado.codigoMateria)
  ) {
    avisos.push(
      `El reporte es de la materia ${encabezado.codigoMateria} y el grupo elegido es de ${esperado.codigoMateria}. ` +
        'Comprueba que sea el archivo correcto.',
    );
  }
  if (encabezado.grupo && !igualSinEspacios(encabezado.grupo, esperado.grupo)) {
    avisos.push(
      `El reporte es del grupo ${encabezado.grupo} y elegiste ${esperado.grupo}. Comprueba que sea el archivo correcto.`,
    );
  }
  return avisos;
}

/** Foto o PDF cualquiera: los lee el servicio de visión con confianza por fila. */
async function leerConVision(
  archivo: Express.Multer.File,
): Promise<{ lectura: Lectura } | { status: number; body: Record<string, unknown> }> {
  const formulario = new FormData();
  formulario.append('file', new Blob([new Uint8Array(archivo.buffer)]), archivo.originalname || 'notas.pdf');

  let lectura: {
    origen: string;
    avisos: string[];
    filas: FilaNotasLeida[];
    columnas: number;
  };
  try {
    // Sin `Content-Type`: lo compone `fetch` con su boundary a partir del
    // FormData. `mlFetch` añade el secreto compartido del servicio.
    const respuesta = await mlFetch('/vision/grades', {
      method: 'POST',
      body: formulario,
      timeoutMs: 60_000,
    });
    if (!respuesta.ok) {
      const detalle = await respuesta.json().catch(() => ({ detail: '' }));
      const mensaje =
        typeof detalle?.detail === 'string' && detalle.detail
          ? detalle.detail
          : 'No se pudo interpretar la planilla de notas.';
      return { status: respuesta.status === 503 ? 503 : 422, body: { ok: false, message: mensaje } };
    }
    lectura = await respuesta.json();
  } catch (error) {
    return {
      status: 503,
      body: {
        ok: false,
        message:
          'El servicio de lectura no está disponible. ' +
          'Puedes subir el archivo como Excel o pegar las notas como texto mientras tanto.',
        cause: error instanceof Error ? error.name : undefined,
      },
    };
  }

  return {
    lectura: {
      origen: lectura.origen,
      avisos: lectura.avisos,
      columnas: lectura.columnas,
      columnasDetalle: null,
      encabezado: null,
      filas: lectura.filas.map(f => ({
        indice: f.indice,
        cedula: f.cedula,
        nombre: f.nombre,
        confianza: f.confianza,
        notas: f.notas,
        avisos: f.avisos,
      })),
    },
  };
}

gradeScanRouter.post(
  '/import/scan',
  requireRole('ADMIN', 'PROFESSOR'),
  subirArchivo.single('file'),
  limiteLotes,
  async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({ ok: false, message: 'Falta el archivo de notas.' });
      }

      // Los bytes tienen que ser los del tipo declarado, y de aquí sale además
      // si es una hoja de cálculo (se interpreta aquí) o una imagen/PDF (va al
      // servicio de visión). Antes esa decisión la tomaba `esExcel()` mirando
      // el mimetype y el nombre, los dos escritos por el cliente.
      const tipoReal = exigirTipoReal(req.file, ENTRADA_DE_ESCANER);

      const { groupId } = z.object({ groupId: z.string().min(1) }).parse(req.body);
      const owned = await grupoPropio(req.user, groupId);
      if ('error' in owned) {
        return res.status(owned.error.status).json({ ok: false, message: owned.error.message });
      }
      const { group } = owned;

      // Un reporte de Academusoft trae el texto exacto: se lee aquí, sin
      // reconocimiento de imágenes y aunque el servicio de visión esté caído.
      // Cualquier otro PDF sigue al servicio de visión como siempre.
      const elementos = tipoReal.mimetype === PDF.mimetype ? await elementosDeTextoPdf(req.file.buffer) : null;
      const academusoft = elementos && esReporteAcademusoft(elementos) ? interpretarReporteAcademusoft(elementos) : null;

      let lectura: Lectura;
      if (academusoft) {
        lectura = {
          origen: 'academusoft',
          filas: academusoft.filas,
          columnas: academusoft.columnas.length,
          columnasDetalle: academusoft.columnas,
          encabezado: academusoft.encabezado,
          avisos: [
            ...avisosDeEncabezado(academusoft.encabezado, {
              codigoMateria: await codigoDeMateria(String(group.subjectId)),
              grupo: group.name,
            }),
            ...academusoft.avisos,
          ],
        };
      } else if (esExcel(tipoReal)) {
        // El Excel se interpreta aquí: exceljs ya es dependencia del backend y
        // no hay reconocimiento que pueda fallar — confianza 1.0.
        const interpretado = interpretarMatrizNotas(await excelAMatriz(req.file.buffer));
        lectura = {
          origen: 'excel',
          avisos: interpretado.avisos,
          filas: interpretado.filas,
          columnas: interpretado.columnas,
          columnasDetalle: null,
          encabezado: null,
        };
      } else {
        const resultado = await leerConVision(req.file);
        if ('status' in resultado) return res.status(resultado.status).json(resultado.body);
        lectura = resultado.lectura;
      }

      const matriculados = await matriculadosDe(groupId, group.period);
      const cruce = cruzarNotasConMatricula(lectura.filas, matriculados);

      // Solo PROPONE: la escritura es `POST /grades/bulk` con lo revisado.
      res.json({
        ok: true,
        origen: lectura.origen,
        groupId,
        subjectId: String(group.subjectId),
        period: group.period,
        columnas: lectura.columnas,
        columnasDetalle: lectura.columnasDetalle,
        encabezado: lectura.encabezado,
        avisos: [...lectura.avisos, ...cruce.avisos],
        filas: cruce.filas,
        sinFila: cruce.sinFila,
      });
    } catch (err) {
      next(err);
    }
  }
);

const filaBulkSchema = z.object({
  studentId: z.string().min(1),
  /** Una posición por columna; `null` = no escribir esa celda. */
  scores: z.array(z.number().min(0).max(5).nullable()).min(1),
});

const corteSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);
const componenteSchema = z.enum(['TRABAJOS', 'PARCIALES', 'AUTOEVALUACION']);
const etiquetaSchema = z.string().trim().min(1).max(60);
const pesoSchema = z.number().min(0.01).max(1000);

/**
 * Dos formas del mismo lote:
 *
 * - **Un corte y un componente para todo** (`corte`, `componentType`,
 *   `labels`, `weights`): la planilla de un docente, como siempre.
 * - **Cada columna con su corte y su componente** (`columnas`): el reporte
 *   de Academusoft trae los tres componentes de hasta tres cortes en el mismo
 *   archivo, y partirlo en nueve peticiones gastaría casi la mitad del cupo
 *   de lotes en una sola importación.
 */
const loteSchema = z
  .object({
    groupId: z.string().min(1),
    corte: corteSchema.optional(),
    componentType: componenteSchema.optional(),
    labels: z.array(etiquetaSchema).min(1).max(10).optional(),
    // Peso relativo por columna, alineado con `labels`. Sin él, cada
    // columna pesa lo que diga la plantilla aplicada al grupo, o 1.
    weights: z.array(pesoSchema).max(10).optional(),
    columnas: z
      .array(
        z.object({
          corte: corteSchema,
          componentType: componenteSchema,
          label: etiquetaSchema,
          weight: pesoSchema.optional(),
        }),
      )
      .min(1)
      .max(10)
      .optional(),
    filas: z.array(filaBulkSchema).min(1).max(500),
  })
  .superRefine((lote, ctx) => {
    const porLote = lote.corte !== undefined || lote.componentType !== undefined || lote.labels !== undefined;
    if (Boolean(lote.columnas) === porLote) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Manda `columnas`, o bien `corte`, `componentType` y `labels`; no las dos cosas.',
      });
    } else if (porLote && (lote.corte === undefined || !lote.componentType || !lote.labels)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Faltan `corte`, `componentType` o `labels`.' });
    }
  });

/** Las dos formas del lote, reducidas a una lista de columnas. */
function columnasDelLote(lote: z.infer<typeof loteSchema>): ColumnaDeLote[] {
  if (lote.columnas) return lote.columnas;
  const { corte, componentType } = lote;
  if (corte === undefined || !componentType) return [];
  return (lote.labels ?? []).map((label, i) => {
    const weight = lote.weights?.[i];
    return weight === undefined ? { corte, componentType, label } : { corte, componentType, label, weight };
  });
}

/**
 * Escritura masiva de notas, solo tras la revisión del docente.
 *
 * Repetir una columna (mismo corte, componente y etiqueta) SOBRESCRIBE la nota
 * anterior, y por eso la respuesta separa `creadas` de `actualizadas` — el
 * cliente debe decir cuántas pisó.
 */
gradeScanRouter.post('/bulk', requireRole('ADMIN', 'PROFESSOR'), limiteLotes, async (req, res, next) => {
  try {
    const body = loteSchema.parse(req.body);

    if (body.weights && body.labels && body.weights.length !== body.labels.length) {
      return res.status(400).json({ ok: false, message: 'Debe venir un peso por cada etiqueta de columna.' });
    }
    const columnas = columnasDelLote(body);

    const claves = columnas.map(c => `${c.corte}|${c.componentType}|${c.label}`);
    if (new Set(claves).size !== claves.length) {
      return res.status(400).json({ ok: false, message: 'Hay columnas repetidas (mismo corte, componente y etiqueta).' });
    }
    if (body.filas.some(f => f.scores.length !== columnas.length)) {
      return res.status(400).json({
        ok: false,
        message: 'Cada fila debe traer una nota (o null) por cada columna.',
      });
    }

    const owned = await grupoPropio(req.user, body.groupId);
    if ('error' in owned) {
      return res.status(owned.error.status).json({ ok: false, message: owned.error.message });
    }
    const { group } = owned;

    await exigirPeriodoAbierto(group.period, 'grade');

    // Solo matriculados del grupo: un id colado escribiría la nota de un
    // estudiante ajeno con el nombre de este grupo.
    const matriculados = await matriculadosDe(body.groupId, group.period);
    const permitidos = new Set(matriculados.map(m => m.id));
    const intrusos = body.filas.filter(f => !permitidos.has(f.studentId));
    if (intrusos.length) {
      return res.status(400).json({
        ok: false,
        message: `${intrusos.length} fila(s) no corresponden a matriculados de este grupo.`,
      });
    }

    const resultado = await escribirLoteDeNotas({
      group,
      columnas,
      filas: body.filas,
      actorId: req.user?.id,
    });

    emitToUser(String(group.professorId), 'sync:update', {
      entity: 'grade',
      action: 'bulk',
      id: body.groupId,
    });
    res.status(201).json({ ok: true, ...resultado });
  } catch (err) {
    next(err);
  }
});
