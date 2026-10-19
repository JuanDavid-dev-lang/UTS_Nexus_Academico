import { Types } from 'mongoose';
import { GroupModel } from '../../models/group.model.js';
import { SubjectModel } from '../../models/subject.model.js';
import { EnrollmentModel } from '../../models/enrollment.model.js';
import { GradeModel } from '../../models/grade.model.js';
import { auditBatch } from '../../shared/audit.js';
import type { Matriculado } from '../../domains/attendance/sheet-match.js';
import type { ComponenteTipo, CorteNumero } from '../../domains/grading/grading.service.js';
import { resolverPeso } from '../../domains/grading/plantilla-notas.js';
import { estructuraDelCorte, estructuraPara } from './grade-templates.service.js';

/**
 * Acceso a datos de la importación de notas.
 *
 * Las rutas validan y responden; aquí se lee el grupo, la matrícula y se
 * escribe el lote. Separado de `grade-scan.routes.ts` cuando el lote pasó a
 * admitir columnas de varios cortes a la vez (el reporte de Academusoft).
 */

type GrupoDeImportacion = {
  _id: unknown;
  name: string;
  subjectId: unknown;
  professorId: unknown;
  period: string;
};

/** Verifica que el grupo exista y pertenezca al docente (o que sea ADMIN). */
export async function grupoPropio(
  usuario: { id: string; role: string } | undefined,
  groupId: string,
): Promise<{ error: { status: number; message: string } } | { group: GrupoDeImportacion }> {
  const group = await GroupModel.findOne({ _id: groupId, deletedAt: null }).lean();
  if (!group) return { error: { status: 404, message: 'Grupo no encontrado' } };
  if (usuario?.role === 'PROFESSOR' && String(group.professorId) !== usuario.id) {
    return { error: { status: 403, message: 'Grupo no asignado' } };
  }
  return { group: { ...group, name: String(group.name), period: String(group.period) } };
}

/** Código de la materia (`TSI601`), para comprobar que el reporte es de ella. */
export async function codigoDeMateria(subjectId: string): Promise<string | null> {
  const materia = await SubjectModel.findById(subjectId).select('code').lean();
  return materia?.code ? String(materia.code) : null;
}

/** Matriculados activos del grupo, en el shape que espera el cruce. */
export async function matriculadosDe(groupId: string, period: string): Promise<Matriculado[]> {
  const matriculas = await EnrollmentModel.find({ groupId, period, deletedAt: null })
    .populate('studentId', 'code fullName')
    .lean();
  return matriculas
    .map(m => m.studentId as unknown as { _id: unknown; code?: string; fullName?: string } | null)
    .filter((s): s is { _id: unknown; code?: string; fullName?: string } => Boolean(s))
    .map(s => ({ id: String(s._id), code: s.code ?? '', fullName: s.fullName ?? '' }));
}

/** Una columna del lote: dónde va cada nota de esa posición. */
export type ColumnaDeLote = {
  corte: CorteNumero;
  componentType: ComponenteTipo;
  label: string;
  /** Peso relativo explícito; sin él decide la plantilla del grupo, o 1. */
  weight?: number;
};

export type FilaDeLote = { studentId: string; scores: (number | null)[] };

/**
 * Escribe el lote ya revisado: cuatro consultas en vez de una por celda.
 *
 * Antes esto era un bucle anidado con `findOne` + `findOneAndUpdate` +
 * auditoría por cada casilla: una planilla llena (500 filas × 10 columnas)
 * salían unas quince mil idas y vueltas **en serie** contra Atlas. Ahora se
 * leen de golpe las notas que ya existen, se escriben todas con un
 * `bulkWrite`, se releen para auditar con el documento real y se registra la
 * auditoría en una sola inserción.
 *
 * El upsert usa la clave única del alta unitaria (estudiante, materia,
 * periodo, corte, componente, label): repetir una columna SOBRESCRIBE, y por
 * eso se separan `creadas` de `actualizadas`.
 */
export async function escribirLoteDeNotas(input: {
  group: GrupoDeImportacion;
  columnas: ColumnaDeLote[];
  filas: FilaDeLote[];
  actorId: string | undefined;
}): Promise<{ creadas: number; actualizadas: number; omitidas: number }> {
  const { group, columnas, filas } = input;

  // Los ids llegan como texto y el esquema los guarda como ObjectId.
  // `bulkWrite` no convierte por su cuenta —`findOneAndUpdate` sí—, y sin la
  // conversión el filtro no encuentra la nota existente: en vez de
  // sobrescribirla, intentaría crear una segunda y chocaría con el índice
  // único.
  const subjectId = new Types.ObjectId(String(group.subjectId));
  const period = group.period;
  const groupObjectId = new Types.ObjectId(String(group._id));
  const teacherObjectId = new Types.ObjectId(String(group.professorId));

  const estructura = await estructuraPara({
    subjectId: String(group.subjectId),
    groupId: String(group._id),
    period,
  });
  const pesoDeColumna = columnas.map(columna =>
    resolverPeso(columna.weight, estructuraDelCorte(estructura, columna.corte), columna.componentType, columna.label),
  );

  let omitidas = 0;
  const celdas: Array<{ studentId: string; columna: ColumnaDeLote; score: number; weight: number }> = [];
  for (const fila of filas) {
    columnas.forEach((columna, i) => {
      const score = fila.scores[i];
      if (score === null || score === undefined) {
        omitidas++;
        return;
      }
      celdas.push({ studentId: fila.studentId, columna, score, weight: pesoDeColumna[i] as number });
    });
  }
  if (!celdas.length) return { creadas: 0, actualizadas: 0, omitidas };

  /** Clave única de Nota, en texto, para cruzar antes y después sin consultar. */
  const claveDe = (studentId: string, corte: number, componentType: string, label: string) =>
    `${studentId}|${corte}|${componentType}|${label}`;
  const clave = (celda: (typeof celdas)[number]) =>
    claveDe(celda.studentId, celda.columna.corte, celda.columna.componentType, celda.columna.label);
  const claveDeNota = (nota: { studentId: unknown; corte: unknown; componentType: unknown; label: unknown }) =>
    claveDe(String(nota.studentId), Number(nota.corte), String(nota.componentType), String(nota.label));

  // Una sola consulta para todas las columnas: cada columna es un
  // (corte, componente, label), y el `$or` las cubre de una vez.
  const filtroDelLote = {
    subjectId,
    period,
    studentId: { $in: [...new Set(celdas.map(c => c.studentId))].map(id => new Types.ObjectId(id)) },
    $or: columnas.map(c => ({ corte: c.corte, componentType: c.componentType, label: c.label })),
    deletedAt: null,
  };

  const previas = await GradeModel.find(filtroDelLote).lean();
  const antesPorClave = new Map(previas.map(nota => [claveDeNota(nota), nota]));

  await GradeModel.bulkWrite(
    celdas.map(celda => ({
      updateOne: {
        filter: {
          studentId: new Types.ObjectId(celda.studentId),
          subjectId,
          period,
          corte: celda.columna.corte,
          componentType: celda.columna.componentType,
          label: celda.columna.label,
        },
        update: {
          $set: {
            groupId: groupObjectId,
            teacherId: teacherObjectId,
            score: celda.score,
            maxScore: 5,
            weight: celda.weight,
            deletedAt: null,
            status: 'ACTIVE',
          },
        },
        upsert: true,
      },
    })),
    { ordered: false },
  );

  // Relectura única para auditar con el documento tal y como quedó: la
  // auditoría tiene que poder responder "qué había" y "qué hay", y el
  // resultado de `bulkWrite` no devuelve los documentos.
  const despues = await GradeModel.find(filtroDelLote).lean();
  const despuesPorClave = new Map(despues.map(nota => [claveDeNota(nota), nota]));

  let creadas = 0;
  let actualizadas = 0;
  const registros = celdas.map(celda => {
    const before = antesPorClave.get(clave(celda)) ?? null;
    if (before) actualizadas++;
    else creadas++;
    const after = despuesPorClave.get(clave(celda)) ?? null;
    return {
      actorId: input.actorId,
      action: before ? 'UPDATE' : 'CREATE',
      entity: 'Nota',
      entityId: String(after?._id ?? ''),
      before,
      after,
    };
  });
  await auditBatch(registros);

  return { creadas, actualizadas, omitidas };
}
