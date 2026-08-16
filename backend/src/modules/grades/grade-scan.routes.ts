import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import ExcelJS from 'exceljs';
import { GroupModel } from '../../models/group.model.js';
import { EnrollmentModel } from '../../models/enrollment.model.js';
import { GradeModel } from '../../models/grade.model.js';
import { identificar, requireRole } from '../../middlewares/auth.js';
import { auditChange } from '../../shared/audit.js';
import { emitToUser } from '../../shared/socket.js';
import { env } from '../../shared/env.js';
import {
  cruzarNotasConMatricula,
  interpretarMatrizNotas,
  type FilaNotasLeida,
} from '../../domains/grading/import-notas.js';
import type { Matriculado } from '../../domains/attendance/sheet-match.js';

/**
 * Importación de calificaciones en dos pasos, con el mismo contrato que el
 * escáner de asistencia y el import de listados:
 *
 *   1. `POST /grades/import/scan` — PROPONE. Lee el archivo (Excel aquí; foto
 *      o PDF en el servicio de visión), cruza con la matrícula y devuelve la
 *      propuesta con confianza. Nunca escribe.
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
  limits: { fileSize: 12 * 1024 * 1024 },
});

/** Verifica que el grupo pertenezca al profesor autenticado (o que sea ADMIN). */
async function grupoPropio(req: any, groupId: string) {
  const group = await GroupModel.findOne({ _id: groupId, deletedAt: null }).lean();
  if (!group) return { error: { status: 404, message: 'Grupo no encontrado' } };
  if (req.user?.role === 'PROFESSOR' && String(group.professorId) !== req.user.id) {
    return { error: { status: 403, message: 'Grupo no asignado' } };
  }
  return { group };
}

/** Matriculados activos del grupo, en el shape que espera el cruce. */
async function matriculadosDe(groupId: string, period: string): Promise<Matriculado[]> {
  const matriculas = await EnrollmentModel.find({ groupId, period, deletedAt: null })
    .populate('studentId', 'code fullName')
    .lean();
  return matriculas
    .map(m => m.studentId as unknown as { _id: unknown; code?: string; fullName?: string } | null)
    .filter((s): s is { _id: unknown; code?: string; fullName?: string } => Boolean(s))
    .map(s => ({ id: String(s._id), code: s.code ?? '', fullName: s.fullName ?? '' }));
}

const EXCEL_MIMES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
]);

function esExcel(file: { mimetype: string; originalname: string }): boolean {
  return EXCEL_MIMES.has(file.mimetype) || /\.xlsx?$/i.test(file.originalname);
}

/** Primera hoja del Excel como matriz de textos. */
async function excelAMatriz(buffer: Buffer): Promise<string[][]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) return [];

  const matriz: string[][] = [];
  ws.eachRow({ includeEmpty: false }, fila => {
    const celdas: string[] = [];
    fila.eachCell({ includeEmpty: true }, celda => {
      const valor = celda.value;
      // `text` resuelve fórmulas y rich text; los números conservan el punto.
      celdas.push(valor === null || valor === undefined ? '' : String(celda.text ?? valor));
    });
    matriz.push(celdas);
  });
  return matriz;
}

gradeScanRouter.post(
  '/import/scan',
  requireRole('ADMIN', 'PROFESSOR'),
  subirArchivo.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({ ok: false, message: 'Falta el archivo de notas.' });
      }

      const { groupId } = z.object({ groupId: z.string().min(1) }).parse(req.body);
      const owned = await grupoPropio(req, groupId);
      if (owned.error) {
        return res.status(owned.error.status).json({ ok: false, message: owned.error.message });
      }
      const group = owned.group!;

      let origen: string;
      let avisosLectura: string[] = [];
      let filasLeidas: FilaNotasLeida[];
      let columnas: number;

      if (esExcel(req.file)) {
        // El Excel se interpreta aquí: exceljs ya es dependencia del backend y
        // no hay reconocimiento que pueda fallar — confianza 1.0.
        const matriz = await excelAMatriz(req.file.buffer);
        const interpretado = interpretarMatrizNotas(matriz);
        origen = 'excel';
        avisosLectura = interpretado.avisos;
        filasLeidas = interpretado.filas;
        columnas = interpretado.columnas;
      } else {
        // Foto o PDF: los lee el servicio de visión y devuelve confianza por fila.
        const formulario = new FormData();
        const bytes = new Uint8Array(req.file.buffer);
        formulario.append('file', new Blob([bytes]), req.file.originalname || 'notas.pdf');

        let lectura: {
          origen: string;
          avisos: string[];
          filas: Array<{
            indice: number;
            cedula: string;
            nombre: string;
            confianza: number;
            notas: (number | null)[];
            avisos: string[];
          }>;
          columnas: number;
        };
        try {
          const respuesta = await fetch(`${env.ML_BASE_URL}/vision/grades`, {
            method: 'POST',
            body: formulario,
            signal: AbortSignal.timeout(60_000),
          });
          if (!respuesta.ok) {
            const detalle = await respuesta.json().catch(() => ({ detail: '' }));
            const mensaje =
              typeof detalle?.detail === 'string' && detalle.detail
                ? detalle.detail
                : 'No se pudo interpretar la planilla de notas.';
            return res.status(respuesta.status === 503 ? 503 : 422).json({ ok: false, message: mensaje });
          }
          lectura = await respuesta.json();
        } catch (error) {
          return res.status(503).json({
            ok: false,
            message:
              'El servicio de lectura no está disponible. ' +
              'Puedes subir el archivo como Excel o pegar las notas como texto mientras tanto.',
            cause: error instanceof Error ? error.name : undefined,
          });
        }

        origen = lectura.origen;
        avisosLectura = lectura.avisos;
        columnas = lectura.columnas;
        filasLeidas = lectura.filas.map(f => ({
          indice: f.indice,
          cedula: f.cedula,
          nombre: f.nombre,
          confianza: f.confianza,
          notas: f.notas,
          avisos: f.avisos,
        }));
      }

      const matriculados = await matriculadosDe(groupId, String(group.period));
      const cruce = cruzarNotasConMatricula(filasLeidas, matriculados);

      // Solo PROPONE: la escritura es `POST /grades/bulk` con lo revisado.
      res.json({
        ok: true,
        origen,
        groupId,
        subjectId: String(group.subjectId),
        period: String(group.period),
        columnas,
        avisos: [...avisosLectura, ...cruce.avisos],
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
  /** Una posición por label; `null` = no escribir esa celda. */
  scores: z.array(z.number().min(0).max(5).nullable()).min(1),
});

/**
 * Escritura masiva de notas, solo tras la revisión del docente.
 *
 * Corte y componente se eligen una vez para todo el lote; cada columna lleva
 * su `label`. El upsert usa la misma clave única del alta unitaria
 * (estudiante, materia, periodo, corte, componente, label): repetir un label
 * SOBRESCRIBE la nota anterior, y por eso la respuesta separa `creadas` de
 * `actualizadas` — el cliente debe decir cuántas pisó.
 */
gradeScanRouter.post('/bulk', requireRole('ADMIN', 'PROFESSOR'), async (req, res, next) => {
  try {
    const body = z
      .object({
        groupId: z.string().min(1),
        corte: z.union([z.literal(1), z.literal(2), z.literal(3)]),
        componentType: z.enum(['TRABAJOS', 'PARCIALES', 'AUTOEVALUACION']),
        labels: z.array(z.string().trim().min(1).max(60)).min(1).max(10),
        filas: z.array(filaBulkSchema).min(1).max(500),
      })
      .parse(req.body);

    if (new Set(body.labels).size !== body.labels.length) {
      return res.status(400).json({ ok: false, message: 'Hay etiquetas de columna repetidas.' });
    }
    const malFormadas = body.filas.filter(f => f.scores.length !== body.labels.length);
    if (malFormadas.length) {
      return res.status(400).json({
        ok: false,
        message: 'Cada fila debe traer una nota (o null) por cada etiqueta de columna.',
      });
    }

    const owned = await grupoPropio(req, body.groupId);
    if (owned.error) {
      return res.status(owned.error.status).json({ ok: false, message: owned.error.message });
    }
    const group = owned.group!;

    // Solo matriculados del grupo: un id colado escribiría la nota de un
    // estudiante ajeno con el nombre de este grupo.
    const matriculados = await matriculadosDe(body.groupId, String(group.period));
    const permitidos = new Set(matriculados.map(m => m.id));
    const intrusos = body.filas.filter(f => !permitidos.has(f.studentId));
    if (intrusos.length) {
      return res.status(400).json({
        ok: false,
        message: `${intrusos.length} fila(s) no corresponden a matriculados de este grupo.`,
      });
    }

    let creadas = 0;
    let actualizadas = 0;
    let omitidas = 0;

    for (const fila of body.filas) {
      for (let i = 0; i < body.labels.length; i++) {
        const score = fila.scores[i];
        if (score === null || score === undefined) {
          omitidas++;
          continue;
        }
        const key = {
          studentId: fila.studentId,
          subjectId: String(group.subjectId),
          period: String(group.period),
          corte: body.corte,
          componentType: body.componentType,
          label: body.labels[i],
        };
        const before = await GradeModel.findOne({ ...key, deletedAt: null }).lean();
        const item = await GradeModel.findOneAndUpdate(
          key,
          {
            $set: {
              ...key,
              groupId: body.groupId,
              teacherId: String(group.professorId),
              score,
              maxScore: 5,
              deletedAt: null,
            },
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        await auditChange({
          actorId: req.user?.id,
          action: before ? 'UPDATE' : 'CREATE',
          entity: 'Nota',
          entityId: item.id,
          before,
          after: item.toObject(),
        });
        if (before) actualizadas++;
        else creadas++;
      }
    }

    emitToUser(String(group.professorId), 'sync:update', {
      entity: 'grade',
      action: 'bulk',
      id: body.groupId,
    });
    res.status(201).json({ ok: true, creadas, actualizadas, omitidas });
  } catch (err) {
    next(err);
  }
});
