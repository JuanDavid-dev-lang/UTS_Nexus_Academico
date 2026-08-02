import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { AttendanceModel } from '../../models/attendance.model.js';
import { GroupModel } from '../../models/group.model.js';
import { StudentModel } from '../../models/student.model.js';
import { auth, requireRole } from '../../middlewares/auth.js';
import { auditChange } from '../../shared/audit.js';
import { emitSync } from '../../shared/socket.js';
import { getEnrolledStudentIds, getProfessorScope } from '../../shared/professor-scope.js';
import { cruzarConMatricula, ordenarPorApellido } from '../../domains/attendance/sheet-match.js';
import { env } from '../../shared/env.js';

/**
 * Importación de asistencia a partir de la foto de una planilla.
 *
 * Son dos pasos separados a propósito. `POST /scan` solo mira la imagen y
 * devuelve una propuesta; no toca la base. `POST /scan/confirm` recibe lo que el
 * docente ya revisó y corrigió, y recién ahí escribe.
 *
 * Nunca se juntan en uno solo. El reconocimiento de una hoja escrita a mano se
 * equivoca, y una asistencia mal guardada no se nota: aparece semanas después
 * como un porcentaje que no cuadra, cuando ya nadie tiene la hoja para
 * contrastar. La revisión humana no es un lujo de la interfaz, es la parte del
 * proceso que hace que el dato sea confiable.
 */
export const attendanceScanRouter = Router();
attendanceScanRouter.use(auth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
});

/** Comprueba que el grupo sea del docente y devuelve su materia y periodo. */
async function grupoDelDocente(req: { user?: { id: string; role: string } }, groupId: string) {
  const group = await GroupModel.findOne({ _id: groupId, deletedAt: null }).lean();
  if (!group) return { error: { status: 404, message: 'Grupo no encontrado' } };
  if (req.user?.role === 'PROFESSOR' && String(group.professorId) !== req.user.id) {
    return { error: { status: 403, message: 'Grupo no asignado' } };
  }
  return { group };
}

attendanceScanRouter.post(
  '/scan',
  requireRole('ADMIN', 'PROFESSOR'),
  upload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ ok: false, message: 'Falta la foto de la planilla.' });

      const { groupId } = z.object({ groupId: z.string().min(1) }).parse(req.body);
      const propietario = await grupoDelDocente(req, groupId);
      if (propietario.error) {
        return res.status(propietario.error.status).json({ ok: false, message: propietario.error.message });
      }
      const group = propietario.group!;

      // Los matriculados del grupo, ordenados como está impresa la planilla.
      const studentIds = await getEnrolledStudentIds({ groupId, period: group.period });
      if (studentIds.length === 0) {
        return res.status(422).json({
          ok: false,
          message: 'Este grupo no tiene estudiantes matriculados. Importa la lista antes de escanear.',
        });
      }
      const estudiantes = await StudentModel.find({ _id: { $in: studentIds }, deletedAt: null })
        .select('code fullName')
        .lean();
      const matriculados = ordenarPorApellido(
        estudiantes.map(e => ({ id: String(e._id), code: String(e.code), fullName: String(e.fullName) })),
      );

      // El reconocimiento vive en el servicio de Python, no aquí: procesar
      // imágenes en el hilo de Node bloquearía todas las demás peticiones.
      const formulario = new FormData();
      // Se copia a Uint8Array: el Buffer de Node no satisface `BlobPart` porque su
      // memoria puede ser un SharedArrayBuffer.
      const bytes = new Uint8Array(req.file.buffer);
      formulario.append('file', new Blob([bytes]), req.file.originalname || 'planilla.jpg');

      let lectura: {
        columnasFecha: number;
        avisos: string[];
        filas: {
          indice: number;
          cedula: string;
          cedulaConfianza: number;
          nombre: string;
          nombreConfianza: number;
          celdas: { columna: number; presente: boolean; dudosa: boolean }[];
        }[];
      };

      try {
        const respuesta = await fetch(`${env.ML_BASE_URL}/vision/attendance-sheet`, {
          method: 'POST',
          body: formulario,
          signal: AbortSignal.timeout(60_000),
        });

        if (!respuesta.ok) {
          const detalle = await respuesta.json().catch(() => ({ detail: '' }));
          const mensaje =
            typeof detalle?.detail === 'string' && detalle.detail
              ? detalle.detail
              : 'El servicio de lectura no pudo interpretar la imagen.';
          return res.status(respuesta.status === 503 ? 503 : 422).json({ ok: false, message: mensaje });
        }
        lectura = await respuesta.json();
      } catch (error) {
        // A diferencia del riesgo, aquí no hay motor de reglas al que caer: sin
        // servicio de visión no hay nada que proponer, y decirlo claro es mejor
        // que devolver una planilla vacía que parezca un problema de la foto.
        return res.status(503).json({
          ok: false,
          message:
            'El servicio de lectura de planillas no está disponible. ' +
            'Puedes registrar la asistencia a mano mientras tanto.',
          cause: error instanceof Error ? error.name : undefined,
        });
      }

      const cruce = cruzarConMatricula(lectura.filas, matriculados);

      res.json({
        ok: true,
        // Se devuelve el contexto para que el cliente no tenga que recordarlo
        // entre el escaneo y la confirmación.
        groupId,
        subjectId: String(group.subjectId),
        period: group.period,
        columnasFecha: lectura.columnasFecha,
        avisos: [...lectura.avisos, ...cruce.avisos],
        filas: cruce.filas,
        ausentesDeLaFoto: cruce.ausentesDeLaFoto,
        matriculados,
      });
    } catch (err) {
      next(err);
    }
  },
);

const confirmacion = z.object({
  groupId: z.string().min(1),
  // Una fecha por columna de la planilla. El docente las confirma o corrige:
  // adivinar la fecha de una clase a partir de la foto y guardarla mal es
  // exactamente el error que este flujo tiene que evitar.
  fechas: z.array(z.coerce.date()).min(1),
  durationMinutes: z.number().int().min(30).max(300).default(90),
  filas: z
    .array(
      z.object({
        studentId: z.string().min(1),
        // Un valor por fecha, en el mismo orden que `fechas`.
        presentes: z.array(z.boolean()),
      }),
    )
    .min(1),
});

attendanceScanRouter.post('/scan/confirm', requireRole('ADMIN', 'PROFESSOR'), async (req, res, next) => {
  try {
    const body = confirmacion.parse(req.body);

    const propietario = await grupoDelDocente(req, body.groupId);
    if (propietario.error) {
      return res.status(propietario.error.status).json({ ok: false, message: propietario.error.message });
    }
    const group = propietario.group!;

    // Se revalida el alcance aquí y no solo en `/scan`: el cliente podría enviar
    // una confirmación con ids que nunca estuvieron en la propuesta.
    const permitidos = new Set(await getEnrolledStudentIds({ groupId: body.groupId, period: group.period }));
    if (req.user?.role === 'PROFESSOR') {
      const scope = await getProfessorScope(req.user.id);
      if (!scope.groupIds.includes(body.groupId)) {
        return res.status(403).json({ ok: false, message: 'Grupo no asignado' });
      }
    }

    const ajenos = body.filas.filter(fila => !permitidos.has(fila.studentId));
    if (ajenos.length > 0) {
      return res.status(403).json({
        ok: false,
        message: `${ajenos.length} fila(s) apuntan a estudiantes que no están matriculados en este grupo.`,
      });
    }

    // Dos columnas con la misma fecha se pisarían entre sí: el índice único es
    // (estudiante, materia, fecha), así que la segunda sobrescribiría a la
    // primera y una de las dos clases desaparecería sin aviso.
    const dias = body.fechas.map(fecha => fecha.toISOString().slice(0, 10));
    if (new Set(dias).size !== dias.length) {
      return res.status(400).json({
        ok: false,
        message: 'Hay columnas con la misma fecha. Cada columna tiene que ser una clase distinta.',
      });
    }

    const descuadradas = body.filas.filter(fila => fila.presentes.length !== body.fechas.length);
    if (descuadradas.length > 0) {
      return res.status(400).json({
        ok: false,
        message: 'Cada fila debe traer una marca por cada fecha.',
      });
    }

    let guardados = 0;
    for (const fila of body.filas) {
      for (let i = 0; i < body.fechas.length; i++) {
        const date = body.fechas[i] as Date;
        const present = fila.presentes[i] as boolean;

        const antes = await AttendanceModel.findOne({
          studentId: fila.studentId,
          subjectId: group.subjectId,
          date,
          deletedAt: null,
        }).lean();

        const item = await AttendanceModel.findOneAndUpdate(
          { studentId: fila.studentId, subjectId: group.subjectId, date },
          {
            $set: {
              present,
              durationMinutes: body.durationMinutes,
              groupId: body.groupId,
              teacherId: String(group.professorId),
              period: group.period,
              // Queda registrado de dónde salió el dato: si mañana alguien
              // reclama una falta, se puede saber que vino de una foto revisada
              // y no de un registro hecho en clase.
              notes: 'Importado desde una planilla fotografiada y revisada.',
            },
          },
          { upsert: true, new: true, setDefaultsOnInsert: true },
        );

        await auditChange({
          actorId: req.user?.id,
          action: antes ? 'UPDATE' : 'CREATE',
          entity: 'Asistencia',
          entityId: item.id,
          before: antes,
          after: item.toObject(),
        });
        guardados++;
      }
    }

    emitSync('sync:update', { entity: 'attendance', action: 'bulk', id: body.groupId });
    res.status(201).json({ ok: true, guardados, clases: body.fechas.length, estudiantes: body.filas.length });
  } catch (err) {
    next(err);
  }
});
