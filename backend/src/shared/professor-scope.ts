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
