import { SubjectModel } from '../models/subject.model.js';
import { GroupModel } from '../models/group.model.js';
import { EnrollmentModel } from '../models/enrollment.model.js';
import { ProfessorModel } from '../models/professor.model.js';
import { UserModel } from '../models/user.model.js';
import {
  ALCANCE_TOTAL,
  construirAlcanceDePrograma,
  type AlcanceDePrograma,
} from '../domains/scope/program-scope.js';
import { esRolPorPrograma } from './types.js';
import type { Role } from './types.js';

/**
 * Acceso a datos del alcance por programa.
 *
 * Aquí solo hay consultas y caché; **la decisión de qué entra en el alcance
 * vive en `domains/scope/program-scope.ts`**, donde se puede probar sin base de
 * datos.
 *
 * Los programas se leen de la **ficha, no del token**, igual que el flag de
 * director de trabajo de grado: asignarle una carrera a una coordinación surte
 * efecto sin que tenga que cerrar sesión. A cambio, cada petición necesitaría
 * cinco consultas, así que el resultado se cachea 15 segundos por usuario —lo
 * bastante para que un listado con sus contadores no las repita, lo bastante
 * poco para que un cambio se note enseguida.
 */

type Entrada = { valor: AlcanceDePrograma; expira: number };

const CACHE_MS = 15_000;
const cache = new Map<string, Entrada>();

/** Invalida el alcance de un usuario. Se llama al cambiarle los programas. */
export function invalidarAlcance(userId?: string) {
  if (userId) cache.delete(String(userId));
  else cache.clear();
}

/**
 * Programas a cargo de un usuario.
 *
 * Se unen los del usuario y los de su ficha de docente: hay coordinaciones que
 * además dictan clase y se registraron por el formulario de docente, así que su
 * adscripción está en `Profesor`. Tomar solo una de las dos fuentes deja fuera
 * a la mitad de las cuentas reales según por dónde se hayan dado de alta.
 */
export async function programasDelUsuario(userId: string): Promise<string[]> {
  const [usuario, ficha] = await Promise.all([
    UserModel.findOne({ _id: userId, deletedAt: null }).select('programas').lean(),
    ProfessorModel.findOne({ userId, deletedAt: null }).select('programas').lean(),
  ]);

  return [...new Set([...(usuario?.programas ?? []), ...(ficha?.programas ?? [])])].filter(Boolean);
}

/**
 * Alcance de quien consulta.
 *
 * ADMIN, PROFESSOR y STUDENT no pasan por aquí: el primero no se acota y los
 * otros dos se acotan por matrícula (`professor-scope.ts`), que es otra regla.
 * Para ellos devuelve el alcance total y quien llama decide qué hacer —así una
 * ruta puede aplicar el alcance sin preguntar antes por el rol.
 */
export async function getProgramScope(user?: { id: string; role: Role }): Promise<AlcanceDePrograma> {
  if (!user || !esRolPorPrograma(user.role)) return ALCANCE_TOTAL;

  const clave = String(user.id);
  const guardado = cache.get(clave);
  if (guardado && guardado.expira > Date.now()) return guardado.valor;

  const valor = await calcularAlcance(user.id);
  cache.set(clave, { valor, expira: Date.now() + CACHE_MS });
  return valor;
}

async function calcularAlcance(userId: string): Promise<AlcanceDePrograma> {
  const programas = await programasDelUsuario(userId);
  if (programas.length === 0) return ALCANCE_TOTAL;

  // Los docentes del programa se necesitan antes que las materias: son el
  // respaldo de las materias que no tienen `programa` escrito.
  const docentes = await ProfessorModel.find({ programas: { $in: programas }, deletedAt: null })
    .select('userId programas')
    .lean();

  const idsDocentes = docentes.map(docente => String(docente.userId));

  // Una sola pasada por materias: las del programa y las de sus docentes. El
  // filtro fino (una materia marcada como de otra carrera no entra por su
  // docente) lo hace el dominio; aquí solo se acota lo que se trae de la base.
  const materias = await SubjectModel.find({
    deletedAt: null,
    $or: [{ programa: { $in: programas } }, { professorId: { $in: idsDocentes } }],
  })
    .select('_id professorId programa')
    .lean();

  const subjectIds = materias.map(materia => materia._id);

  const [grupos, matriculas] = await Promise.all([
    GroupModel.find({ subjectId: { $in: subjectIds }, deletedAt: null })
      .select('_id subjectId professorId')
      .lean(),
    EnrollmentModel.find({
      subjectId: { $in: subjectIds },
      deletedAt: null,
      enrollmentStatus: 'ACTIVE',
    })
      .select('studentId subjectId')
      .lean(),
  ]);

  return construirAlcanceDePrograma({ programas, materias, grupos, matriculas, docentes });
}
