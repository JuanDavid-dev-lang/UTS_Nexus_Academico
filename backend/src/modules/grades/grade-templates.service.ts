/**
 * Plantillas de corte y estructuras aplicadas: acceso a datos.
 *
 * Qué es una plantilla válida y qué peso le toca a una nota lo decide
 * `domains/grading/plantilla-notas.ts`, puro. Aquí solo hay consultas y
 * escrituras; las rutas no importan ningún modelo.
 */
import { Types } from 'mongoose';
import { GradeTemplateModel } from '../../models/grade-template.model.js';
import { GradeStructureModel } from '../../models/grade-structure.model.js';
import { EnrollmentModel } from '../../models/enrollment.model.js';
import { GroupModel } from '../../models/group.model.js';
import { SubjectModel } from '../../models/subject.model.js';
import {
  normalizarEstructura,
  validarEstructura,
  type EstructuraCorte,
} from '../../domains/grading/plantilla-notas.js';
import type { CorteNumero } from '../../domains/grading/grading.service.js';

/** Error de negocio con código HTTP. `shared/error.ts` lo traduce tal cual. */
class HttpError extends Error {
  statusCode: number;
  constructor(statusCode: number, mensaje: string) {
    super(mensaje);
    this.statusCode = statusCode;
  }
}

export type CorteEstructura = { corte: CorteNumero; componentes: EstructuraCorte };

export type EstructuraAplicada = {
  _id: string;
  subjectId: string;
  groupId: string | null;
  period: string;
  professorId: string;
  plantillaId: string | null;
  nombre: string;
  cortes: CorteEstructura[];
};

function aEstructura(doc: {
  _id: unknown;
  subjectId: unknown;
  groupId?: unknown;
  period: string;
  professorId: unknown;
  plantillaId?: unknown;
  nombre?: string;
  cortes?: { corte: number; componentes: EstructuraCorte }[];
}): EstructuraAplicada {
  return {
    _id: String(doc._id),
    subjectId: String(doc.subjectId),
    groupId: doc.groupId ? String(doc.groupId) : null,
    period: doc.period,
    professorId: String(doc.professorId),
    plantillaId: doc.plantillaId ? String(doc.plantillaId) : null,
    nombre: doc.nombre ?? '',
    cortes: (doc.cortes ?? []).map(c => ({
      corte: c.corte as CorteNumero,
      componentes: normalizarEstructura(c.componentes),
    })),
  };
}

/** Lanza 400 con los problemas de la estructura, si los hay. */
function exigirEstructuraValida(estructura: EstructuraCorte): EstructuraCorte {
  const problemas = validarEstructura(estructura);
  if (problemas.length) throw new HttpError(400, problemas.join(' '));
  return normalizarEstructura(estructura);
}

// ── Plantillas (del docente) ────────────────────────────────────────────────

export async function listarPlantillas(professorId: string) {
  return GradeTemplateModel.find({ professorId, deletedAt: null }).sort({ name: 1 }).lean();
}

export async function crearPlantilla(input: {
  professorId: string;
  name: string;
  componentes: EstructuraCorte;
}) {
  const componentes = exigirEstructuraValida(input.componentes);
  return GradeTemplateModel.create({
    professorId: input.professorId,
    name: input.name,
    componentes,
  });
}

export async function actualizarPlantilla(
  id: string,
  professorId: string,
  cambios: { name?: string; componentes?: EstructuraCorte }
) {
  const set: Record<string, unknown> = {};
  if (cambios.name !== undefined) set.name = cambios.name;
  if (cambios.componentes) set.componentes = exigirEstructuraValida(cambios.componentes);
  const before = await GradeTemplateModel.findOne({ _id: id, professorId, deletedAt: null }).lean();
  if (!before) return null;
  const item = await GradeTemplateModel.findOneAndUpdate(
    { _id: id, professorId, deletedAt: null },
    { $set: set },
    { new: true }
  );
  return item ? { before, item } : null;
}

export async function borrarPlantilla(id: string, professorId: string) {
  return GradeTemplateModel.findOneAndUpdate(
    { _id: id, professorId, deletedAt: null },
    { $set: { deletedAt: new Date(), status: 'DELETED' } },
    { new: true }
  );
}

// ── Estructuras (plantilla aplicada a materia / grupo) ──────────────────────

/**
 * La estructura vigente para una materia y, si se pide, un grupo: la del
 * grupo manda; si no hay, la de la materia entera. `null` si no hay ninguna.
 */
export async function estructuraPara(input: {
  subjectId: string;
  groupId?: string | null;
  period: string;
}): Promise<EstructuraAplicada | null> {
  const candidatos = await GradeStructureModel.find({
    subjectId: input.subjectId,
    period: input.period,
    deletedAt: null,
    groupId: input.groupId ? { $in: [new Types.ObjectId(input.groupId), null] } : null,
  }).lean();
  if (!candidatos.length) return null;
  const delGrupo = input.groupId ? candidatos.find(c => c.groupId && String(c.groupId) === input.groupId) : null;
  return aEstructura(delGrupo ?? candidatos.find(c => !c.groupId) ?? candidatos[0]!);
}

/**
 * La estructura que aplica a UN estudiante concreto: se mira el grupo en el
 * que está matriculado en esa materia. Es lo que usa `POST /grades` para
 * poner el peso sin que el cliente lo mande.
 */
export async function estructuraDeEstudiante(input: {
  subjectId: string;
  studentId: string;
  groupId?: string | null;
  period: string;
}): Promise<EstructuraAplicada | null> {
  let groupId = input.groupId ?? null;
  if (!groupId) {
    const matricula = await EnrollmentModel.findOne({
      subjectId: input.subjectId,
      studentId: input.studentId,
      period: input.period,
      deletedAt: null,
      enrollmentStatus: 'ACTIVE',
    })
      .select('groupId')
      .lean();
    groupId = matricula?.groupId ? String(matricula.groupId) : null;
  }
  return estructuraPara({ subjectId: input.subjectId, groupId, period: input.period });
}

/** La estructura de un corte concreto, o null. */
export function estructuraDelCorte(
  estructura: EstructuraAplicada | null,
  corte: CorteNumero
): EstructuraCorte | null {
  return estructura?.cortes.find(c => c.corte === corte)?.componentes ?? null;
}

/** Todas las estructuras de un docente en un periodo (para la pantalla de notas). */
export async function listarEstructuras(input: { professorId?: string; period: string; subjectIds?: string[] }) {
  const filtro: Record<string, unknown> = { period: input.period, deletedAt: null };
  if (input.professorId) filtro.professorId = input.professorId;
  if (input.subjectIds) filtro.subjectId = { $in: input.subjectIds };
  const docs = await GradeStructureModel.find(filtro).lean();
  return docs.map(aEstructura);
}

/**
 * Aplica una estructura a una materia (y grupo). Exige que la materia y el
 * grupo sean del docente: aplicar sobre la materia de otro cambiaría cómo se
 * pesan sus notas sin que lo supiera.
 */
export async function aplicarEstructura(input: {
  professorId: string;
  esAdmin: boolean;
  subjectId: string;
  groupId?: string | null;
  period: string;
  plantillaId?: string | null;
  nombre?: string;
  cortes: CorteEstructura[];
}) {
  const materia = await SubjectModel.findOne({ _id: input.subjectId, deletedAt: null })
    .select('professorId')
    .lean();
  if (!materia) throw new HttpError(404, 'La materia no existe.');
  if (!input.esAdmin && String(materia.professorId) !== input.professorId) {
    throw new HttpError(403, 'La materia no es tuya.');
  }
  if (input.groupId) {
    const grupo = await GroupModel.findOne({
      _id: input.groupId,
      subjectId: input.subjectId,
      deletedAt: null,
    })
      .select('professorId')
      .lean();
    if (!grupo) throw new HttpError(404, 'El grupo no existe en esa materia.');
    if (!input.esAdmin && String(grupo.professorId) !== input.professorId) {
      throw new HttpError(403, 'El grupo no es tuyo.');
    }
  }

  const cortesVistos = new Set<number>();
  const cortes = input.cortes.map(c => {
    if (cortesVistos.has(c.corte)) throw new HttpError(400, `El corte ${c.corte} aparece dos veces.`);
    cortesVistos.add(c.corte);
    return { corte: c.corte, componentes: exigirEstructuraValida(c.componentes) };
  });

  const clave = { subjectId: input.subjectId, groupId: input.groupId ?? null, period: input.period };
  const before = await GradeStructureModel.findOne({ ...clave, deletedAt: null }).lean();
  const item = await GradeStructureModel.findOneAndUpdate(
    { ...clave, deletedAt: null },
    {
      $set: {
        professorId: input.professorId,
        plantillaId: input.plantillaId ?? null,
        nombre: input.nombre ?? '',
        cortes,
      },
      $setOnInsert: clave,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return { before, item: aEstructura(item.toObject()) };
}

export async function quitarEstructura(id: string, professorId: string, esAdmin: boolean) {
  const filtro: Record<string, unknown> = { _id: id, deletedAt: null };
  if (!esAdmin) filtro.professorId = professorId;
  const item = await GradeStructureModel.findOneAndUpdate(
    filtro,
    { $set: { deletedAt: new Date(), status: 'DELETED' } },
    { new: true }
  );
  return item ? aEstructura(item.toObject()) : null;
}
