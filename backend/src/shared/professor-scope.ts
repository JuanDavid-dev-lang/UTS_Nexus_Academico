import { SubjectModel } from '../models/subject.model.js';
import { GroupModel } from '../models/group.model.js';
import { EnrollmentModel } from '../models/enrollment.model.js';
import {
  construirAlcance,
  dentroDelAlcance,
  filtroDeMatricula,
  type EnrollmentFilter,
  type ProfessorScope,
} from '../domains/scope/professor-scope.js';

/**
 * Acceso a datos del alcance de un docente.
 *
 * Aquí solo hay consultas. **Qué se hace con lo que devuelven vive en
 * `domains/scope/`**, donde se puede probar sin base de datos — que es lo que
 * necesita la garantía de que un docente no ve los estudiantes de otro.
 */

export type { ProfessorScope, EnrollmentFilter };

/**
 * Alcance de un profesor: sus materias, sus grupos y SOLO los estudiantes
 * matriculados en esos grupos.
 */
export async function getProfessorScope(userId: string): Promise<ProfessorScope> {
  const [subjects, groups, enrollments] = await Promise.all([
    SubjectModel.find({ professorId: userId, deletedAt: null }).select('_id studentIds').lean(),
    GroupModel.find({ professorId: userId, deletedAt: null }).select('_id studentIds').lean(),
    EnrollmentModel.find({ professorId: userId, deletedAt: null, enrollmentStatus: 'ACTIVE' })
      .select('studentId')
      .lean(),
  ]);

  return construirAlcance(subjects, groups, enrollments);
}

/**
 * Ids de estudiantes con matrícula activa dentro de un ámbito concreto.
 *
 * `getProfessorScope` responde "todos los estudiantes de este docente"; esta
 * función responde "los de ESTA materia o ESTE grupo", que es lo que necesita
 * cualquier listado por asignatura. Sin ella, un docente que dicta dos materias
 * ve las dos listas fundidas en una sola.
 */
export async function getEnrolledStudentIds(filter: EnrollmentFilter): Promise<string[]> {
  const enrollments = await EnrollmentModel.find(filtroDeMatricula(filter))
    .select('studentId')
    .lean();
  return [...new Set(enrollments.map(enrollment => String(enrollment.studentId)))];
}

/**
 * ¿Puede este docente ver/editar la ficha de este estudiante?
 *
 * Los endpoints por id (`GET /:id`, `PATCH /:id`) tienen que preguntarlo de
 * forma explícita: filtrar solo el listado deja la ficha individual accesible a
 * cualquiera que adivine o copie un id.
 */
export async function professorOwnsStudent(userId: string, studentId: string): Promise<boolean> {
  return dentroDelAlcance(await getProfessorScope(userId), studentId);
}
