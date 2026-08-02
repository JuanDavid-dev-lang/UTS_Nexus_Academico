import { SubjectModel } from '../models/subject.model.js';
import { GroupModel } from '../models/group.model.js';
import { EnrollmentModel } from '../models/enrollment.model.js';

export type ProfessorScope = {
  subjectIds: string[];
  groupIds: string[];
  studentIds: string[];
};

/**
 * Alcance de un profesor: sus materias, sus grupos y SOLO los estudiantes
 * matriculados en esos grupos. La fuente principal es la colección Matrícula;
 * se conserva un respaldo sobre `studentIds[]` legados para no romper datos
 * previos a la migración.
 */
export async function getProfessorScope(userId: string): Promise<ProfessorScope> {
  const [subjects, groups, enrollments] = await Promise.all([
    SubjectModel.find({ professorId: userId, deletedAt: null }).select('_id studentIds').lean(),
    GroupModel.find({ professorId: userId, deletedAt: null }).select('_id studentIds').lean(),
    EnrollmentModel.find({ professorId: userId, deletedAt: null, enrollmentStatus: 'ACTIVE' })
      .select('studentId')
      .lean(),
  ]);

  const studentIds = new Set<string>();
  for (const enrollment of enrollments) studentIds.add(String(enrollment.studentId));
  // Respaldo legado (datos previos a Matrícula).
  for (const subject of subjects) for (const id of subject.studentIds ?? []) studentIds.add(String(id));
  for (const group of groups) for (const id of group.studentIds ?? []) studentIds.add(String(id));

  return {
    subjectIds: subjects.map(subject => String(subject._id)),
    groupIds: groups.map(group => String(group._id)),
    studentIds: [...studentIds],
  };
}

export type EnrollmentFilter = {
  subjectId?: string;
  groupId?: string;
  period?: string;
  professorId?: string;
};

/**
 * Ids de estudiantes con matrícula activa dentro de un ámbito concreto.
 *
 * `getProfessorScope` responde "todos los estudiantes de este docente"; esta
 * función responde "los de ESTA materia o ESTE grupo", que es lo que necesita
 * cualquier listado por asignatura. Sin ella, un docente que dicta dos materias
 * ve las dos listas fundidas en una sola.
 */
export async function getEnrolledStudentIds(filter: EnrollmentFilter): Promise<string[]> {
  const query: Record<string, unknown> = { deletedAt: null, enrollmentStatus: 'ACTIVE' };
  if (filter.subjectId) query.subjectId = filter.subjectId;
  if (filter.groupId) query.groupId = filter.groupId;
  if (filter.period) query.period = filter.period;
  if (filter.professorId) query.professorId = filter.professorId;

  const enrollments = await EnrollmentModel.find(query).select('studentId').lean();
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
  const scope = await getProfessorScope(userId);
  return scope.studentIds.includes(String(studentId));
}
