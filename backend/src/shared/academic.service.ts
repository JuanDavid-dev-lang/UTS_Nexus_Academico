/**
 * Servicio académico compartido (capa de datos). Reúne notas y asistencia,
 * las agrupa por (estudiante, materia, periodo) y aplica los dominios puros
 * (grading + risk) para producir registros consolidados reutilizables por el
 * dashboard, el listado de riesgos y el generador de notificaciones.
 *
 * Es la ÚNICA ruta de agregación académica: evita fórmulas paralelas.
 */
import { Types } from 'mongoose';
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
  /** Limita a una materia sin delegar el filtro al cliente. */
  subjectId?: string;
  /**
   * Limita a un conjunto de materias. Es lo que usa el alcance por programa:
   * coordinacion pregunta por sus carreras, que son N materias, no una.
   */
  subjectIds?: string[];
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

/**
 * Filtro de la etapa `$match`.
 *
 * **Los identificadores se convierten a ObjectId a mano.** `find()` los castea
 * solo a partir del esquema; `aggregate()` no lo hace, así que un `teacherId`
 * en texto no casa con el ObjectId guardado y la etapa devuelve cero
 * documentos — sin error, sin aviso, solo un panel vacío. Es la trampa clásica
 * al pasar de una a otra.
 */
function baseMatch(filter: AcademicFilter): Record<string, unknown> {
  const aId = (valor: string) => (Types.ObjectId.isValid(valor) ? new Types.ObjectId(valor) : valor);

  const query: Record<string, unknown> = { deletedAt: null };
  if (filter.teacherId) query.teacherId = aId(filter.teacherId);
  if (filter.period) query.period = filter.period;
  if (filter.studentId) query.studentId = aId(filter.studentId);
  else if (filter.studentIds) query.studentId = { $in: filter.studentIds.map(aId) };
  if (filter.subjectId) query.subjectId = aId(filter.subjectId);
  else if (filter.subjectIds) query.subjectId = { $in: filter.subjectIds.map(aId) };
  return query;
}

/** Agrupación común: una entrada por (estudiante, materia, periodo). */
const CLAVE_GRUPO = { studentId: '$studentId', subjectId: '$subjectId', period: '$period' };

type ClaveAgrupada = { studentId: unknown; subjectId: unknown; period: string };

/**
 * Reúne notas y asistencia por (estudiante, materia, periodo).
 *
 * Antes esto eran dos `find()` sin límite: **todas** las notas y **toda** la
 * asistencia del alcance, documentos enteros, a memoria de Node, para después
 * agruparlas con un `Map`. Con un ADMIN —que no lleva `teacherId`— el alcance
 * es la institución completa, y esta función la usan el panel, el listado de
 * riesgo, las notificaciones, los reportes y cada mensaje del asistente. Era
 * el techo real del proceso, y se alcanzaba a la vez desde cinco sitios.
 *
 * Ahora agrupa Mongo. Viaja solo lo que los dominios puros necesitan —tres
 * campos por nota, dos por clase— en vez del documento completo con sus
 * marcas de tiempo, sus ObjectId y sus notas de texto. El resultado por
 * bucket es el mismo, así que `grading` y `risk` siguen recibiendo
 * exactamente lo que recibían: aquí no se calcula nada, solo se recoge.
 */
export async function computeAcademicRecords(filter: AcademicFilter): Promise<AcademicRecord[]> {
  const match = baseMatch(filter);

  const [gradeGroups, attendanceGroups] = await Promise.all([
    GradeModel.aggregate<
      ClaveAgrupada & {
        groupId: unknown;
        teacherId: unknown;
        notas: { corte: number; tipo: string; score: number }[];
      }
    >([
      // El corte y el componente tienen que ser válidos: el filtro estaba antes
      // en el bucle de Node y baja aquí para no traer lo que se iba a descartar.
      { $match: { ...match, corte: { $in: [1, 2, 3] }, componentType: { $ne: null } } },
      {
        $group: {
          _id: CLAVE_GRUPO,
          groupId: { $first: '$groupId' },
          teacherId: { $first: '$teacherId' },
          notas: {
            $push: { corte: '$corte', tipo: '$componentType', score: { $ifNull: ['$score', 0] } },
          },
        },
      },
      {
        $project: {
          _id: 0,
          studentId: '$_id.studentId',
          subjectId: '$_id.subjectId',
          period: '$_id.period',
          groupId: 1,
          teacherId: 1,
          notas: 1,
        },
      },
    ]),
    AttendanceModel.aggregate<
      ClaveAgrupada & {
        groupId: unknown;
        teacherId: unknown;
        asistencia: { present: boolean; durationMinutes: number | null }[];
      }
    >([
      { $match: match },
      {
        $group: {
          _id: CLAVE_GRUPO,
          groupId: { $first: '$groupId' },
          teacherId: { $first: '$teacherId' },
          asistencia: {
            $push: { present: '$present', durationMinutes: '$durationMinutes' },
          },
        },
      },
      {
        $project: {
          _id: 0,
          studentId: '$_id.studentId',
          subjectId: '$_id.subjectId',
          period: '$_id.period',
          groupId: 1,
          teacherId: 1,
          asistencia: 1,
        },
      },
    ]),
  ]);

  const buckets = new Map<string, Bucket>();
  const ensure = (studentId: string, subjectId: string, period: string, groupId: any, teacherId: any): Bucket => {
    const key = `${studentId}::${subjectId}::${period}`;
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

  for (const grupo of gradeGroups) {
    const bucket = ensure(
      String(grupo.studentId),
      String(grupo.subjectId),
      String(grupo.period),
      grupo.groupId,
      grupo.teacherId,
    );
    for (const nota of grupo.notas) {
      bucket.notas.push({
        corte: nota.corte as CorteNumero,
        tipo: nota.tipo as ComponenteTipo,
        score: Number(nota.score ?? 0),
      });
    }
  }

  for (const grupo of attendanceGroups) {
    const bucket = ensure(
      String(grupo.studentId),
      String(grupo.subjectId),
      String(grupo.period),
      grupo.groupId,
      grupo.teacherId,
    );
    for (const clase of grupo.asistencia) {
      bucket.asistencia.push({ present: clase.present, durationMinutes: clase.durationMinutes });
    }
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
