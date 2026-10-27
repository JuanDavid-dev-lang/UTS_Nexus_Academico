/**
 * Acceso a datos de las excusas de inasistencia. Lo que decide si una falta se
 * puede justificar vive en `domains/attendance/excusa.ts`; aquí solo se lee y
 * se escribe el registro.
 */
import { AttendanceModel } from '../../models/attendance.model.js';
import type { MotivoExcusa } from '../../domains/attendance/excusa.js';
import { dentroDelAlcanceDePrograma, type AlcanceDePrograma } from '../../domains/scope/program-scope.js';
import { getProfessorScope } from '../../shared/professor-scope.js';

export type RegistroConExcusa = {
  _id: unknown;
  studentId: unknown;
  subjectId: unknown;
  teacherId: unknown;
  period: string;
  present: boolean;
  excusa?: { motivo: MotivoExcusa; detalle: string; registradaPor: unknown; registradaEn: Date } | null;
};

export function registroDeAsistencia(id: string): Promise<RegistroConExcusa | null> {
  return AttendanceModel.findOne({ _id: id, deletedAt: null }).lean<RegistroConExcusa | null>();
}

/**
 * Si quien llama puede justificar este registro: el docente con la materia y
 * el estudiante en su alcance, coordinación con los dos en sus programas,
 * ADMIN siempre. Es el mismo criterio que el seguimiento de un caso.
 */
export async function puedeGestionarExcusa(
  usuario: { id: string; role: string } | undefined,
  alcance: AlcanceDePrograma | undefined,
  registro: RegistroConExcusa,
): Promise<boolean> {
  const studentId = String(registro.studentId);
  const subjectId = String(registro.subjectId);
  if (alcance && !alcance.total) {
    return dentroDelAlcanceDePrograma(alcance, 'subjectIds', subjectId)
      && dentroDelAlcanceDePrograma(alcance, 'studentIds', studentId);
  }
  if (usuario?.role !== 'PROFESSOR') return true;
  const scope = await getProfessorScope(usuario.id);
  return scope.subjectIds.includes(subjectId) && scope.studentIds.includes(studentId);
}

export function guardarExcusa(
  id: string,
  excusa: { motivo: MotivoExcusa; detalle: string; registradaPor: string } | null,
) {
  const cambio = excusa
    ? { $set: { excusa: { ...excusa, registradaEn: new Date() } } }
    : { $set: { excusa: null } };
  return AttendanceModel.findOneAndUpdate({ _id: id, deletedAt: null }, cambio, { new: true }).lean();
}
