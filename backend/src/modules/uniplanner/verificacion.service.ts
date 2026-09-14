/**
 * Verificación automática de los enlaces de UniPlanner.
 *
 * El estudiante se enlaza con su universidad, su número de documento y su
 * nombre completo. Aquí se comprueba que los tres casan con un estudiante
 * registrado en Nexus —ese documento, matriculado en esa universidad, con ese
 * nombre— y, si casan, el enlace queda verificado sin que nadie lo revise a
 * mano. Lo que decide es puro (`domains/uniplanner/link-verification.ts`); esto
 * solo lee, cruza y escribe.
 *
 * Dos entradas:
 *
 * - **Por cursor** (`verificarEnlacesPedidos`, el scheduler cada minuto): los
 *   enlaces nuevos y los que la persona corrigió, por `verificationRequestedAt`.
 *   Solo se leen los que cambiaron desde la pasada anterior.
 * - **Por estudiante** (`verificarEnlacesDeEstudiantes`): tras importar una
 *   lista o matricular a alguien. Quien se enlazó antes de que su docente
 *   cargara el curso quedó en `not_matched`, y es en ese momento cuando pasa a
 *   casar.
 *
 * La verificación manual de «Vínculos UniPlanner» sigue ahí para las
 * excepciones, y un enlace verificado a mano nunca se desverifica desde aquí.
 *
 * Al quedar verificado se le escribe un aviso en su buzón
 * (`avisarEnlaceVerificado`): la verificación puede llegar horas después de
 * enlazarse, cuando el docente carga el curso, y para entonces la persona ya no
 * está mirando la pantalla del enlace.
 */
import { Types } from 'mongoose';
import { ConfigModel } from '../../models/config.model.js';
import { EnrollmentModel } from '../../models/enrollment.model.js';
import { InstitutionModel } from '../../models/institution.model.js';
import { StudentModel } from '../../models/student.model.js';
import { SubjectModel } from '../../models/subject.model.js';
import { UserModel } from '../../models/user.model.js';
import { auditChange } from '../../shared/audit.js';
import * as puente from '../../shared/uniplanner.js';
import { partesDelEnlace } from '../../domains/uniplanner/link-admin.js';
import { idDeEnlace } from '../../domains/uniplanner/link-id.js';
import { decidirVerificacion, type EstadoVerificacion } from '../../domains/uniplanner/link-verification.js';
import { avisoDeEnlaceVerificado, idDelAvisoDeVerificacion } from '../../domains/uniplanner/message.js';

const CLAVE_CURSOR = 'uniplanner_verificacion_cursor';

type Cursor = { desde: string | null; ids: string[] };

/**
 * Las universidades de cada estudiante, por su matrícula: la materia, el
 * docente que la dicta y el perfil institucional de ese docente. Cuatro
 * consultas para toda la tanda, no cuatro por estudiante.
 */
async function institucionesDe(studentIds: Types.ObjectId[]): Promise<Map<string, Set<string>>> {
  const resultado = new Map<string, Set<string>>();
  if (studentIds.length === 0) return resultado;

  const matriculas = await EnrollmentModel.find({ studentId: { $in: studentIds }, deletedAt: null })
    .select('studentId subjectId')
    .lean();
  const materias = await SubjectModel.find({ _id: { $in: [...new Set(matriculas.map((m) => String(m.subjectId)))] } })
    .select('professorId')
    .lean();
  const docentes = await UserModel.find({ _id: { $in: materias.map((m) => m.professorId).filter(Boolean) } })
    .select('institutionId')
    .lean();
  const perfiles = await InstitutionModel.find({
    _id: { $in: docentes.map((d) => (d as { institutionId?: unknown }).institutionId).filter(Boolean) },
  })
    .select('institutionId')
    .lean();

  const clavePorPerfil = new Map(perfiles.map((p) => [String(p._id), String(p.institutionId ?? '')]));
  const clavePorDocente = new Map(
    docentes.map((d) => [String(d._id), clavePorPerfil.get(String((d as { institutionId?: unknown }).institutionId)) ?? '']),
  );
  const clavePorMateria = new Map(materias.map((m) => [String(m._id), clavePorDocente.get(String(m.professorId)) ?? '']));

  for (const matricula of matriculas) {
    const clave = clavePorMateria.get(String(matricula.subjectId));
    if (!clave) continue;
    const id = String(matricula.studentId);
    const conjunto = resultado.get(id) ?? new Set<string>();
    conjunto.add(clave);
    resultado.set(id, conjunto);
  }
  return resultado;
}

type Candidato = {
  id: string;
  uid: string;
  nombre: string;
  verified: boolean;
  estadoVerificacion: EstadoVerificacion | null;
};

/**
 * Le dice a la persona, en su buzón, que su enlace quedó verificado. Un fallo
 * no deshace la verificación: el enlace ya está bien, solo falta el aviso.
 */
export async function avisarEnlaceVerificado(uid: string, institucion: string, linkId: string): Promise<boolean> {
  if (!uid) return false;
  const envio = await puente.escribirAviso(uid, institucion, avisoDeEnlaceVerificado(), idDelAvisoDeVerificacion(linkId));
  return envio.ok;
}

/**
 * Decide una tanda de enlaces y escribe lo que corresponda.
 *
 * `siempre`: escribir aunque el estado no cambie. Los pedidos por cursor lo
 * necesitan —la persona corrigió su nombre y su app espera ver que se volvió a
 * comprobar—; los que llegan por una importación, no: reescribir `not_matched`
 * a cientos de enlaces sería una escritura en otro proyecto por nada.
 */
async function decidirYEscribir(candidatos: Candidato[], siempre: boolean) {
  const porVerificar = candidatos.filter((c) => !c.verified && c.nombre.trim());
  const partes = new Map(
    porVerificar.flatMap((c) => {
      const p = partesDelEnlace(c.id);
      return p ? [[c.id, p] as const] : [];
    }),
  );
  const codigos = [...new Set([...partes.values()].map((p) => p.codigo))];
  const estudiantes = codigos.length
    ? await StudentModel.find({ code: { $in: codigos }, deletedAt: null }).select('code fullName').lean()
    : [];
  const estudiantePorCodigo = new Map(estudiantes.map((e) => [String(e.code), e]));
  const instituciones = await institucionesDe(estudiantes.map((e) => e._id as Types.ObjectId));

  let verificados = 0;
  let sinCoincidencia = 0;
  for (const candidato of porVerificar) {
    const p = partes.get(candidato.id);
    if (!p) continue;
    const estudiante = estudiantePorCodigo.get(p.codigo);
    const estado = decidirVerificacion(
      { institucion: p.institucion, nombre: candidato.nombre },
      estudiante
        ? { nombre: String(estudiante.fullName ?? ''), instituciones: instituciones.get(String(estudiante._id)) ?? new Set() }
        : null,
    );
    if (!estado) continue;
    if (!siempre && estado === candidato.estadoVerificacion) continue;
    if (!siempre && estado === 'not_matched') continue;
    if (await puente.escribirVerificacion(candidato.id, estado)) {
      if (estado === 'verified') {
        verificados++;
        await avisarEnlaceVerificado(candidato.uid, p.institucion, candidato.id);
      } else {
        sinCoincidencia++;
      }
    }
  }

  if (verificados + sinCoincidencia > 0) {
    await auditChange({
      actorId: null,
      action: 'uniplanner.verificacion',
      entity: 'EnlaceUniPlanner',
      entityId: null,
      before: null,
      after: { verificados, sinCoincidencia, revisados: porVerificar.length },
    });
  }
  return { revisados: porVerificar.length, verificados, sinCoincidencia };
}

/** Una pasada por los enlaces nuevos o corregidos desde la anterior. */
export async function verificarEnlacesPedidos(): Promise<{ revisados: number; verificados: number; sinCoincidencia: number }> {
  const guardado = await ConfigModel.findOne({ key: CLAVE_CURSOR }).lean();
  const cursor: Cursor = (guardado?.value as Cursor | undefined) ?? { desde: null, ids: [] };

  const lectura = await puente.leerEnlacesPorVerificar(cursor.desde ? new Date(cursor.desde) : null);
  if (!lectura.ok || lectura.enlaces.length === 0) return { revisados: 0, verificados: 0, sinCoincidencia: 0 };

  // El cursor es `>=`: el último de la pasada anterior vuelve a salir. Se
  // descartan los que ya se vieron en ese mismo instante.
  const vistos = new Set(cursor.ids);
  const nuevos = lectura.enlaces.filter(
    (e) => !(cursor.desde && e.pedidoEn.toISOString() === cursor.desde && vistos.has(e.id)),
  );
  const resultado = await decidirYEscribir(
    nuevos.map((e) => ({ id: e.id, uid: e.uid, nombre: e.nombre, verified: e.verified, estadoVerificacion: e.estadoVerificacion })),
    true,
  );

  const ultimo = lectura.enlaces.at(-1)!.pedidoEn.toISOString();
  const enElUltimo = lectura.enlaces.filter((e) => e.pedidoEn.toISOString() === ultimo).map((e) => e.id);
  await ConfigModel.updateOne(
    { key: CLAVE_CURSOR },
    { $set: { value: { desde: ultimo, ids: ultimo === cursor.desde ? [...new Set([...cursor.ids, ...enElUltimo])] : enElUltimo } } },
    { upsert: true },
  );
  return resultado;
}

/**
 * Vuelve a comprobar los enlaces de unos estudiantes: los de una lista recién
 * importada o una matrícula nueva. Solo escribe los que pasan a `verified`.
 */
export async function verificarEnlacesDeEstudiantes(studentIds: string[]): Promise<{ verificados: number }> {
  if (!puente.configurado() || studentIds.length === 0) return { verificados: 0 };
  const ids = [...new Set(studentIds)].filter((id) => Types.ObjectId.isValid(id)).map((id) => new Types.ObjectId(id));
  const estudiantes = await StudentModel.find({ _id: { $in: ids }, deletedAt: null }).select('code').lean();
  const instituciones = await institucionesDe(ids);

  const linkIds = estudiantes.flatMap((e) =>
    [...(instituciones.get(String(e._id)) ?? [])].flatMap((clave) => {
      const id = idDeEnlace(clave, String(e.code ?? ''));
      return id ? [id] : [];
    }),
  );
  const enlaces = await puente.buscarEnlaces(linkIds);
  const { verificados } = await decidirYEscribir(
    [...enlaces].map(([id, e]) => ({ id, uid: e.uid, nombre: e.nombre, verified: e.verified, estadoVerificacion: e.estadoVerificacion })),
    false,
  );
  return { verificados };
}

/**
 * `verificarEnlacesDeEstudiantes` sin esperar a UniPlanner. La matrícula, el
 * lote de fichas o el cambio de nombre ya se guardaron; que Firestore tarde o
 * falle no puede convertir esa respuesta en un error.
 */
export function reverificarEnSegundoPlano(studentIds: string[]): void {
  void verificarEnlacesDeEstudiantes(studentIds).catch((err) =>
    console.warn('[uniplanner] no se pudo volver a verificar:', err instanceof Error ? err.message : err),
  );
}
