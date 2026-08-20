import { Router } from 'express';
import multer from 'multer';
import { esExcel, excelAMatriz } from '../../shared/excel.js';
import { z } from 'zod';
import * as campo from '../../shared/validation.js';
import { EnrollmentModel } from '../../models/enrollment.model.js';
import { GroupModel } from '../../models/group.model.js';
import { StudentModel } from '../../models/student.model.js';
import { identificar, requireRole } from '../../middlewares/auth.js';
import { auditChange } from '../../shared/audit.js';
import { emitToUser } from '../../shared/socket.js';
import { env } from '../../shared/env.js';
import { interpretarMatrizListado } from '../../domains/enrollment/import-roster.js';
import { exigirPeriodoAbierto } from '../../shared/period-guard.js';

export const enrollmentRouter = Router();
enrollmentRouter.use(identificar);

/** En memoria: el archivo se reenvía al servicio de lectura y no se guarda. */
const subirArchivo = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
});

/** Verifica que el grupo pertenezca al profesor autenticado (o que sea ADMIN/COORDINATOR). */
async function assertGroupOwnership(req: any, groupId: string) {
  const group = await GroupModel.findOne({ _id: groupId, deletedAt: null }).lean();
  if (!group) return { error: { status: 404, message: 'Grupo no encontrado' } };
  if (req.user?.role === 'PROFESSOR' && String(group.professorId) !== req.user.id) {
    return { error: { status: 403, message: 'Grupo no asignado' } };
  }
  return { group };
}

// Matrículas de un grupo (o todas las del profesor).
enrollmentRouter.get('/', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'), async (req, res, next) => {
  try {
    const filter: Record<string, unknown> = { deletedAt: null };
    if (req.user?.role === 'PROFESSOR') filter.professorId = req.user.id;
    // subjectId faltaba y los dos clientes lo mandan: sin él, la «lista de la
    // materia» eran las matrículas de TODAS las materias del docente, y sobre
    // esa lista se ofrecía capturar notas y asistencia de quien no cursa esta.
    if (req.query.subjectId) filter.subjectId = String(req.query.subjectId);
    if (req.query.groupId) filter.groupId = String(req.query.groupId);
    if (req.query.period) filter.period = String(req.query.period);
    const pagina = campo.paginacionCon(2000).parse(req.query);
    const { skip, limit } = campo.saltoYTope(pagina);
    const [items, total] = await Promise.all([
      // Sin populate: ningún cliente usa la identidad incrustada —los dos la
      // reducían al id y cruzaban nombres con /students— y el objeto poblado
      // es justo la forma que los rompió. Ids planos es lo que toda versión
      // instalada entiende.
      EnrollmentModel.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      EnrollmentModel.countDocuments(filter),
    ]);
    res.json(campo.respuestaPaginada(items, total, pagina));
  } catch (err) {
    next(err);
  }
});

// Matricular un estudiante existente en un grupo.
enrollmentRouter.post('/', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'), async (req, res, next) => {
  try {
    const body = z.object({ studentId: z.string(), groupId: z.string() }).parse(req.body);
    const owned = await assertGroupOwnership(req, body.groupId);
    if (owned.error) return res.status(owned.error.status).json({ ok: false, message: owned.error.message });
    const group = owned.group!;

    // El upsert creaba la matrícula aunque el estudiante no existiera: una
    // referencia colgante que ningún listado puede resolver después.
    const existe = await StudentModel.exists({ _id: body.studentId, deletedAt: null });
    if (!existe) {
      return res.status(404).json({ ok: false, message: 'El estudiante no existe.' });
    }

    // La matrícula define quién sale en el acta: con el periodo cerrado, una
    // matrícula nueva añadiría un estudiante que la fotografía no contempla.
    await exigirPeriodoAbierto(String(group.period), 'enrollment');

    const item = await EnrollmentModel.findOneAndUpdate(
      { studentId: body.studentId, groupId: body.groupId, period: group.period },
      {
        $set: { enrollmentStatus: 'ACTIVE' },
        $setOnInsert: {
          studentId: body.studentId,
          groupId: body.groupId,
          subjectId: group.subjectId,
          professorId: group.professorId,
          period: group.period,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    await auditChange({ actorId: req.user?.id, action: 'CREATE', entity: 'Matricula', entityId: item.id, after: item.toObject() });
    emitToUser(String(group.professorId), 'sync:update', { entity: 'enrollment', action: 'create', id: item.id });
    res.status(201).json({ ok: true, item });
  } catch (err) {
    next(err);
  }
});

/**
 * Importación masiva: crea/actualiza estudiantes (por cédula) y los matricula en
 * el grupo. Orden de columnas esperado: cédula (code), nombres (fullName).
 */
/**
 * Lee un listado de estudiantes desde un PDF o una foto.
 *
 * Solo PROPONE. Devuelve las filas que se creyó leer, con su confianza, para
 * que el docente las revise y confirme con `POST /bulk`, que es el único que
 * escribe. Juntarlo en un paso sería peligroso de una forma que no se nota:
 * una cédula mal reconocida no da error, crea un estudiante que no existe y lo
 * matricula, y eso se descubre semanas después cuando alguien no aparece en el
 * consolidado.
 */
enrollmentRouter.post(
  '/import/scan',
  requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'),
  subirArchivo.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({ ok: false, message: 'Falta el archivo del listado.' });
      }

      const { groupId } = z.object({ groupId: z.string().min(1) }).parse(req.body);
      const owned = await assertGroupOwnership(req, groupId);
      if (owned.error) {
        return res.status(owned.error.status).json({ ok: false, message: owned.error.message });
      }

      if (esExcel(req.file)) {
        const lectura = interpretarMatrizListado(await excelAMatriz(req.file.buffer));
        return res.json({
          ok: true,
          origen: 'excel',
          avisos: lectura.avisos,
          filas: lectura.filas.map(fila => ({
            code: fila.cedula,
            fullName: fila.nombre,
            email: fila.correo || undefined,
            program: fila.programa || undefined,
            confianza: fila.confianza,
            avisos: fila.avisos,
          })),
        });
      }

      const formulario = new FormData();
      // Copia a Uint8Array: el Buffer de Node no satisface `BlobPart` porque su
      // memoria puede venir de un SharedArrayBuffer.
      const bytes = new Uint8Array(req.file.buffer);
      formulario.append('file', new Blob([bytes]), req.file.originalname || 'listado.pdf');

      let lectura: {
        origen: string;
        avisos: string[];
        filas: Array<{
          indice: number;
          cedula: string;
          nombre: string;
          correo: string;
          programa: string;
          confianza: number;
          avisos: string[];
        }>;
      };

      try {
        const respuesta = await fetch(`${env.ML_BASE_URL}/vision/roster`, {
          method: 'POST',
          body: formulario,
          signal: AbortSignal.timeout(60_000),
        });

        if (!respuesta.ok) {
          const detalle = await respuesta.json().catch(() => ({ detail: '' }));
          const mensaje =
            typeof detalle?.detail === 'string' && detalle.detail
              ? detalle.detail
              : 'No se pudo interpretar el listado.';
          return res.status(respuesta.status === 503 ? 503 : 422).json({ ok: false, message: mensaje });
        }
        lectura = await respuesta.json();
      } catch (error) {
        // Sin servicio de lectura no hay nada que proponer. Se dice claro en vez
        // de devolver una lista vacía que parezca culpa del archivo.
        return res.status(503).json({
          ok: false,
          message:
            'El servicio de lectura no está disponible. ' +
            'Puedes pegar la lista como texto mientras tanto.',
          cause: error instanceof Error ? error.name : undefined,
        });
      }

      res.json({
        ok: true,
        origen: lectura.origen,
        avisos: lectura.avisos,
        // Se devuelve con los nombres que ya espera `POST /bulk`, para que
        // confirmar sea mandar de vuelta lo mismo que se revisó.
        filas: lectura.filas.map(fila => ({
          code: fila.cedula,
          fullName: fila.nombre,
          email: fila.correo || undefined,
          program: fila.programa || undefined,
          confianza: fila.confianza,
          avisos: fila.avisos,
        })),
      });
    } catch (err) {
      next(err);
    }
  }
);

enrollmentRouter.post('/bulk', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'), async (req, res, next) => {
  try {
    const body = z.object({
      groupId: z.string(),
      students: z.array(z.object({
        code: campo.codigo.min(3),
        fullName: campo.nombre.min(3),
        email: campo.correo.optional(),
        program: campo.linea.optional(),
      })).min(1).max(campo.TOPE_LOTE),
    }).parse(req.body);

    const owned = await assertGroupOwnership(req, body.groupId);
    if (owned.error) return res.status(owned.error.status).json({ ok: false, message: owned.error.message });
    const group = owned.group!;

    await exigirPeriodoAbierto(String(group.period), 'enrollment');

    /**
     * Alta del listado en cuatro consultas, no en dos por estudiante.
     *
     * Esta es la ruta de "importar la lista de mi grupo", la más usada de todo
     * el módulo, y hacía un `findOneAndUpdate` de Estudiante más otro de
     * Matrícula por cada fila, encadenados. Un grupo de 40 eran 80 viajes en
     * serie; un listado de programa entero se pasaba del minuto y el docente
     * no sabía si había funcionado.
     *
     * Van en dos pasos porque el segundo depende del primero: la matrícula
     * necesita el `_id` del estudiante, y para los que se acaban de crear ese
     * id no existía antes del `bulkWrite`.
     */
    const codigos = [...new Set(body.students.map(row => row.code))];

    await StudentModel.bulkWrite(
      body.students.map(row => ({
        updateOne: {
          filter: { code: row.code, deletedAt: null },
          update: {
            $set: { fullName: row.fullName },
            // Sin `academicHistory`: es un array del esquema, Mongoose lo
            // entrega como `[]` al leer aunque el documento no lo traiga, y
            // declararlo aquí rompe el tipado de `bulkWrite`.
            //
            // `attendanceRate`/`academicPerformance` sí van explícitos: a
            // diferencia de `findOneAndUpdate({ setDefaultsOnInsert: true })`,
            // `bulkWrite` no aplica los valores por defecto del esquema al
            // insertar. Sin esto, un estudiante dado de alta por esta ruta
            // quedaba sin esos dos campos (`undefined`, no `0`), a diferencia
            // de uno creado por `POST /students/bulk`.
            $setOnInsert: {
              code: row.code,
              email: row.email ?? `${row.code}@estudiantes.uts.edu.co`,
              program: row.program ?? 'UTS',
              attendanceRate: 0,
              academicPerformance: 0,
            },
          },
          upsert: true,
        },
      })),
      { ordered: false },
    );

    const estudiantes = await StudentModel.find({ code: { $in: codigos }, deletedAt: null })
      .select('_id code')
      .lean();

    await EnrollmentModel.bulkWrite(
      estudiantes.map(estudiante => ({
        updateOne: {
          filter: { studentId: estudiante._id, groupId: group._id, period: group.period },
          update: {
            $set: { enrollmentStatus: 'ACTIVE', deletedAt: null },
            $setOnInsert: {
              studentId: estudiante._id,
              groupId: group._id,
              subjectId: group.subjectId,
              professorId: group.professorId,
              period: group.period,
            },
          },
          upsert: true,
        },
      })),
      { ordered: false },
    );

    const matriculados = estudiantes.length;

    emitToUser(String(group.professorId), 'sync:update', { entity: 'enrollment', action: 'bulk', id: body.groupId });
    res.status(201).json({ ok: true, count: matriculados });
  } catch (err) {
    next(err);
  }
});

// Retirar (soft) una matrícula.
enrollmentRouter.delete('/:id', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'), async (req, res, next) => {
  try {
    const before = await EnrollmentModel.findById(req.params.id).lean();
    if (!before) return res.status(404).json({ ok: false, message: 'Not found' });
    if (req.user?.role === 'PROFESSOR' && String(before.professorId) !== req.user.id) {
      return res.status(403).json({ ok: false, message: 'Forbidden' });
    }
    if (before.period) await exigirPeriodoAbierto(String(before.period), 'enrollment');
    await EnrollmentModel.updateOne(
      { _id: req.params.id },
      { $set: { deletedAt: new Date(), enrollmentStatus: 'WITHDRAWN', status: 'DELETED' } }
    );
    await auditChange({ actorId: req.user?.id, action: 'DELETE', entity: 'Matricula', entityId: String(before._id), before });
    emitToUser(String(before.professorId), 'sync:update', { entity: 'enrollment', action: 'delete', id: req.params.id });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
