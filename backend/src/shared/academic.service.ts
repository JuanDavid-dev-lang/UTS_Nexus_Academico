/**
 * Servicio académico compartido (capa de datos). Reúne notas y asistencia,
 * las agrupa por (estudiante, materia, periodo) y aplica los dominios puros
 * (grading + risk) para producir registros consolidados reutilizables por el
 * dashboard, el listado de riesgos y el generador de notificaciones.
 *
 * Es la ÚNICA ruta de agregación académica: evita fórmulas paralelas.
 */
import { GradeModel } from '../models/grade.model.js';
import { AttendanceModel } from '../models/attendance.model.js';
import { StudentModel } from '../models/student.model.js';
import {
  calcularNotaFinal,
  type NotaComponente,
  type CorteNumero,
  type ComponenteTipo,
} from '../domains/grading/grading.service.js';
import { evaluarRiesgo, type ResultadoRiesgo } from '../domains/risk/risk.service.js';

export type AcademicFilter = {
  /** Limita a las notas/asistencia de un docente. */
  teacherId?: string;
  /** Limita a un conjunto de estudiantes. */
  studentIds?: string[];
  /** Limita a un solo estudiante (self-service). */
  studentId?: string;
  period?: string;
};

export type AcademicRecord = {
  studentId: string;
  subjectId: string;
  groupId: string | null;
  teacherId: string | null;
  period: string;
  code: string;
  fullName: string;
  notaFinal: number;
  /** Nota de cada corte [C1, C2, C3]. */
  cortes: number[];
  aprobado: boolean;
  notaCompleta: boolean;
  tieneNotas: boolean;
  riesgo: ResultadoRiesgo;
};

type Bucket = {
  studentId: string;
  subjectId: string;
  groupId: string | null;
  teacherId: string | null;
  period: string;
  notas: NotaComponente[];
  asistencia: { present: boolean; durationMinutes?: number | null }[];
};

function baseFilter(filter: AcademicFilter): Record<string, unknown> {
  const query: Record<string, unknown> = { deletedAt: null };
  if (filter.teacherId) query.teacherId = filter.teacherId;
  if (filter.period) query.period = filter.period;
  if (filter.studentId) query.studentId = filter.studentId;
  else if (filter.studentIds) query.studentId = { $in: filter.studentIds };
  return query;
}

const keyOf = (studentId: string, subjectId: string, period: string) =>
  `${studentId}::${subjectId}::${period}`;

export async function computeAcademicRecords(filter: AcademicFilter): Promise<AcademicRecord[]> {
  const [grades, attendance] = await Promise.all([
    GradeModel.find(baseFilter(filter)).lean(),
    AttendanceModel.find(baseFilter(filter)).lean(),
  ]);

  const buckets = new Map<string, Bucket>();
  const ensure = (studentId: string, subjectId: string, period: string, groupId: any, teacherId: any): Bucket => {
    const key = keyOf(studentId, subjectId, period);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        studentId,
        subjectId,
        groupId: groupId ? String(groupId) : null,
        teacherId: teacherId ? String(teacherId) : null,
        period,
        notas: [],
        asistencia: [],
      };
      buckets.set(key, bucket);
    }
    return bucket;
  };

  for (const g of grades) {
    if (!(g.corte === 1 || g.corte === 2 || g.corte === 3) || !g.componentType) continue;
    const bucket = ensure(String(g.studentId), String(g.subjectId), String(g.period), g.groupId, g.teacherId);
    bucket.notas.push({
      corte: g.corte as CorteNumero,
      tipo: g.componentType as ComponenteTipo,
      score: Number(g.score ?? 0),
    });
  }

  for (const a of attendance) {
    const bucket = ensure(String(a.studentId), String(a.subjectId), String(a.period), a.groupId, a.teacherId);
    bucket.asistencia.push({ present: a.present, durationMinutes: a.durationMinutes });
  }

  const studentIds = [...new Set([...buckets.values()].map(b => b.studentId))];
  const students = await StudentModel.find({ _id: { $in: studentIds } })
    .select('code fullName')
    .lean();
  const studentMap = new Map(students.map(s => [String(s._id), s]));

  return [...buckets.values()].map(bucket => {
    const nota = calcularNotaFinal(bucket.notas);
    const riesgo = evaluarRiesgo({ notas: bucket.notas, asistencia: bucket.asistencia });
    const student = studentMap.get(bucket.studentId);
    return {
      studentId: bucket.studentId,
      subjectId: bucket.subjectId,
      groupId: bucket.groupId,
      teacherId: bucket.teacherId,
      period: bucket.period,
      code: student?.code ?? '',
      fullName: student?.fullName ?? '',
      notaFinal: nota.notaFinal,
      cortes: nota.cortes.map(c => c.nota),
      aprobado: nota.aprobado,
      notaCompleta: nota.completo,
      tieneNotas: bucket.notas.length > 0,
      riesgo,
    };
  });
}
