import { Router } from 'express';
import { z } from 'zod';
import * as campo from '../../shared/validation.js';
import { identificar, requireRole } from '../../middlewares/auth.js';
import { emitSync } from '../../shared/socket.js';
import {
  getProfessorScope,
  getEnrolledStudentIds,
  professorOwnsStudent,
} from '../../shared/professor-scope.js';
import { intersectar, particionarLotePorAlcance } from '../../domains/scope/professor-scope.js';
import { dentroDelAlcanceDePrograma } from '../../domains/scope/program-scope.js';
import { limiteLotes } from '../../middlewares/rate-limit.js';
import {
  createStudent,
  estudiantesPorCodigo,
  findStudent,
  listStudents,
  searchStudents,
  softDeleteStudent,
  updateStudent,
  upsertStudents,
} from './student.service.js';

export const studentRouter = Router();

studentRouter.use(identificar);

/** Neutraliza los metacaracteres para que el texto buscado se trate como literal. */
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Qué fichas de estudiante puede *modificar* quien hace la petición.
 *
 * Une los dos acotados que ya existen —el del docente por matrícula y el de
 * coordinación por programa— en la forma que espera `particionarLotePorAlcance`.
 * Se calcula aquí y no en el dominio porque las dos mitades son consultas.
 *
 * `total: true` es ADMIN, y también coordinación sin programas asignados, que
 * es como se comportaba antes de que el alcance existiera.
 */
async function alcanceDeEscrituraDeEstudiantes(req: {
  user?: { id: string; role: string };
  alcance?: { total: boolean; studentIds: string[] };
}): Promise<{ total: boolean; studentIds: string[] }> {
  const esDocente = req.user?.role === 'PROFESSOR';
  const acotadoPorPrograma = Boolean(req.alcance && !req.alcance.total);

  if (!esDocente && !acotadoPorPrograma) return { total: true, studentIds: [] };

  const delDocente = esDocente ? (await getProfessorScope(req.user!.id)).studentIds : null;
  const delPrograma = acotadoPorPrograma ? req.alcance!.studentIds : null;

  // Los dos a la vez se intersectan, igual que en el listado: ninguno amplía al
  // otro. Un docente de otra carrera no gana alcance por ser también docente.
  const studentIds =
    delDocente && delPrograma
      ? intersectar(delDocente, delPrograma)
      : (delDocente ?? delPrograma ?? []);

  return { total: false, studentIds };
}

/**
 * Listado de estudiantes.
 *
 * Sin filtros devuelve el ámbito completo del rol; con `subjectId` o `groupId`
 * devuelve solo la lista de esa asignatura o grupo. Un docente nunca escapa de
 * su propio ámbito: los filtros se intersectan con él, no lo reemplazan.
 */
studentRouter.get('/', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'), async (req, res, next) => {
  try {
    const query = z
      .object({
        subjectId: z.string().optional(),
        groupId: z.string().optional(),
        period: z.string().optional(),
        q: z.string().trim().max(120).optional(),
      })
      .merge(campo.paginacionCon(1000))
      .parse(req.query);

    const filter: Record<string, unknown> = { deletedAt: null };
    const isProfessor = req.user?.role === 'PROFESSOR';

    let allowedIds: string[] | null = null;
    if (isProfessor) {
      const scope = await getProfessorScope(req.user!.id);
      allowedIds = scope.studentIds;
    }
    // Coordinación y secretaría: los estudiantes matriculados en materias de
    // sus programas. Se intersecta como el de docente —nunca reemplaza— para
    // que un `?subjectId=` ajeno devuelva vacío en lugar de la lista de otro.
    if (req.alcance && !req.alcance.total) {
      allowedIds = allowedIds
        ? intersectar(allowedIds, req.alcance.studentIds)
        : req.alcance.studentIds;
    }

    if (query.subjectId || query.groupId || query.period) {
      const enrolled = await getEnrolledStudentIds({
        subjectId: query.subjectId,
        groupId: query.groupId,
        period: query.period,
        // Acota la matrícula al docente autenticado: un id de materia ajeno
        // deja de devolver nada en vez de filtrar la lista de otro profesor.
        professorId: isProfessor ? req.user!.id : undefined,
      });
      allowedIds = allowedIds ? intersectar(allowedIds, enrolled) : enrolled;
    }

    if (allowedIds) filter._id = { $in: allowedIds };

    if (query.q) {
      /**
       * La búsqueda es del servidor, no del cliente.
       *
       * El escritorio filtraba en memoria sobre la lista ya descargada, y eso
       * solo funciona mientras la lista sea *toda* la lista: en cuanto se
       * pagina, el estudiante de la página cinco deja de existir para la
       * búsqueda sin que nada lo indique. Por eso `email` y `programa` se
       * añaden aquí — eran los dos campos que el filtro del cliente cubría y
       * este no.
       */
      const term = new RegExp(escapeRegex(query.q), 'i');
      filter.$or = [{ fullName: term }, { code: term }, { email: term }, { program: term }];
    }

    // El conteo va en paralelo con la página: son dos consultas independientes
    // y encadenarlas duplicaba la espera sin ninguna razón.
    const { skip, limit } = campo.saltoYTope(query);
    const { items, total } = await listStudents(filter, skip, limit);
    res.json(campo.respuestaPaginada(items, total, query));
  } catch (err) {
    next(err);
  }
});

/**
 * Búsqueda en el directorio global, para matricular en una materia nueva.
 *
 * Es deliberadamente más amplia que `GET /` — un docente tiene que poder
 * encontrar a un estudiante que aún no es suyo — y por eso devuelve solo la
 * identidad mínima: ni notas, ni asistencia, ni riesgo. Exige tres caracteres
 * y acota el resultado para que no sirva como volcado del padrón.
 */
studentRouter.get('/search', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'), async (req, res, next) => {
  try {
    const query = z
      .object({
        q: z.string().trim().min(3, 'Escribe al menos 3 caracteres para buscar').max(120),
        limit: z.coerce.number().int().min(1).max(50).default(20),
      })
      .parse(req.query);

    const term = new RegExp(escapeRegex(query.q), 'i');
    const items = await searchStudents(term, query.limit);

    res.json({ ok: true, items });
  } catch (err) {
    next(err);
  }
});

studentRouter.get('/:id', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'), async (req, res, next) => {
  try {
    if (req.user?.role === 'PROFESSOR' && !(await professorOwnsStudent(req.user.id, String(req.params.id)))) {
      return res.status(403).json({ ok: false, message: 'Estudiante fuera de tus asignaturas' });
    }
    if (!dentroDelAlcanceDePrograma(req.alcance!, 'studentIds', req.params.id)) {
      return res.status(403).json({ ok: false, message: 'Estudiante fuera de tus programas' });
    }
    const item = await findStudent(String(req.params.id));
    if (!item) return res.status(404).json({ ok: false, message: 'Not found' });
    res.json({ ok: true, item });
  } catch (err) {
    next(err);
  }
});

/**
 * Ficha de estudiante. Una sola definición para el alta unitaria y la masiva:
 * dos copias divergen, y la que se olvida acaba siendo la que no valida.
 */
const fichaEstudiante = z.object({
  code: campo.codigo.min(3),
  fullName: campo.nombre.min(3),
  email: campo.correo.optional(),
  program: campo.linea.min(2),
  photoUrl: campo.url.nullable().optional(),
});

studentRouter.post('/', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'), async (req, res, next) => {
  try {
    const body = fichaEstudiante.parse(req.body);

    const item = await createStudent(body);
    emitSync('sync:update', { entity: 'student', action: 'create', id: item.id });
    res.status(201).json({ ok: true, item });
  } catch (err) {
    next(err);
  }
});

studentRouter.post('/bulk', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'), limiteLotes, async (req, res, next) => {
  try {
    // El tope no es cosmético: sin él, el tamaño del lote lo decidía el límite
    // del cuerpo HTTP, que no tiene ninguna relación con lo que esta ruta puede
    // escribir de una vez.
    const body = z.array(fichaEstudiante).min(1).max(campo.TOPE_LOTE).parse(req.body);

    /**
     * El alcance se comprueba ANTES de escribir, y se comprueba aquí porque el
     * upsert casa por cédula y no por id: sin esto, mandar la cédula de
     * cualquier estudiante de la institución le reescribía la ficha. Era la
     * puerta de atrás de `PATCH /students/:id`, que sí lo comprobaba.
     *
     * Crear a alguien que no existe sigue permitido para todos: es el trabajo
     * de esta ruta. Lo que se cierra es *modificar* a quien ya existe y no
     * corresponde a quien llama.
     */
    const alcance = await alcanceDeEscrituraDeEstudiantes(req);
    const { permitidas, rechazadas } = particionarLotePorAlcance(
      body,
      await estudiantesPorCodigo(body.map(fila => fila.code)),
      alcance,
    );

    if (permitidas.length === 0) {
      return res.status(403).json({
        ok: false,
        message:
          'Ninguna de las fichas del lote está a tu alcance: todas corresponden a ' +
          'estudiantes de otras asignaturas o programas.',
        rechazadas,
      });
    }

    // Una escritura para todo el lote y una lectura para devolverlo, en vez de
    // un `findOneAndUpdate` por fila. Importar un listado de 300 estudiantes
    // eran 300 viajes encadenados a la base; ahora son dos.
    const items = await upsertStudents(permitidas);

    emitSync('sync:update', { entity: 'student', action: 'bulk', id: String(items.length) });
    // `rechazadas` va siempre, aunque esté vacía: un cliente que la lea no tiene
    // que distinguir «no hubo rechazos» de «esta versión no las informa».
    res.status(201).json({ ok: true, items, count: items.length, rechazadas });
  } catch (err) {
    next(err);
  }
});

studentRouter.patch('/:id', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'), async (req, res, next) => {
  try {
    if (req.user?.role === 'PROFESSOR' && !(await professorOwnsStudent(req.user.id, String(req.params.id)))) {
      return res.status(403).json({ ok: false, message: 'Estudiante fuera de tus asignaturas' });
    }
    if (!dentroDelAlcanceDePrograma(req.alcance!, 'studentIds', req.params.id)) {
      return res.status(403).json({ ok: false, message: 'Estudiante fuera de tus programas' });
    }

    const body = z.object({
      fullName: campo.nombre.min(3).optional(),
      email: campo.correo.optional(),
      program: campo.linea.min(2).optional(),
      photoUrl: campo.url.nullable().optional(),
      attendanceRate: z.number().min(0).max(100).optional(),
      academicPerformance: z.number().min(0).max(5).optional(),
    }).parse(req.body);

    const item = await updateStudent(String(req.params.id), body);
    if (!item) return res.status(404).json({ ok: false, message: 'Not found' });
    emitSync('sync:update', { entity: 'student', action: 'update', id: item.id });
    res.json({ ok: true, item });
  } catch (err) {
    next(err);
  }
});

studentRouter.delete('/:id', requireRole('ADMIN', 'COORDINATOR'), async (req, res, next) => {
  try {
    // Borrar un estudiante arrastra sus notas y su asistencia en todas las
    // materias, incluidas las de carreras que no son de esta coordinación.
    if (!dentroDelAlcanceDePrograma(req.alcance!, 'studentIds', req.params.id)) {
      return res.status(403).json({ ok: false, message: 'Estudiante fuera de tus programas' });
    }
    const item = await softDeleteStudent(String(req.params.id));
    if (!item) return res.status(404).json({ ok: false, message: 'Not found' });
    emitSync('sync:update', { entity: 'student', action: 'delete', id: item.id });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
