/**
 * Actividades académicas: orquestación y acceso a datos.
 *
 * `activity.routes.ts` no importa el modelo; se lo pide todo a este servicio.
 * La regla de qué estado se ve (`LATE` derivado, nunca guardado) es pura y
 * vive en `domains/activities/activity-status.ts`.
 */
import { Types } from 'mongoose';
import { ActivityModel } from '../../models/activity.model.js';
import { GroupModel } from '../../models/group.model.js';
import { EnrollmentModel } from '../../models/enrollment.model.js';
import { auditChange } from '../../shared/audit.js';
import { emitToUser } from '../../shared/socket.js';
import { getProfessorScope } from '../../shared/professor-scope.js';
import { calcularDiff } from '../../shared/sanitize.js';
import {
  derivarEstado,
  type EstadoDerivado,
  type EstadoPersistido,
} from '../../domains/activities/activity-status.js';
import * as campo from '../../shared/validation.js';

/** Error de negocio con código HTTP; sin `statusCode` caería en un 500. */
export class ErrorDeActividad extends Error {
  constructor(
    message: string,
    public statusCode: number,
  ) {
    super(message);
    this.name = 'ErrorDeActividad';
  }
}

export type Solicitante = { id: string; role: string; studentId?: string };

/**
 * Materias en las que un estudiante está matriculado.
 *
 * Sale de la matrícula y de la ficha vinculada a la sesión, nunca de lo que
 * declare el cliente. Sin ficha vinculada devuelve lista vacía: se cierra a
 * nada, no se abre a todo.
 */
async function materiasDelEstudiante(studentId?: string): Promise<string[]> {
  if (!studentId) return [];
  const matriculas = await EnrollmentModel.find({
    studentId,
    deletedAt: null,
    enrollmentStatus: 'ACTIVE',
  })
    .select('subjectId')
    .lean();
  return [...new Set(matriculas.map(m => String(m.subjectId)))];
}

export type FiltroActividades = {
  subjectId?: string;
  groupId?: string;
  period?: string;
  /** Estado **derivado**: `LATE` se resuelve después de consultar. */
  estado?: EstadoDerivado;
  desde?: Date;
  hasta?: Date;
  q?: string;
};

type ActividadPlana = Record<string, any>;

/** Añade el estado derivado sin tocar lo guardado. */
function conEstadoDerivado(documento: ActividadPlana, ahora = new Date()) {
  const estado = derivarEstado(documento.status, documento.dueAt, ahora);
  return {
    ...documento,
    /** Lo que decidió una persona. */
    status: documento.status === 'LATE' ? 'OPEN' : documento.status,
    /** Lo que se muestra: la decisión más el reloj. */
    estado,
    vencida: estado === 'LATE',
  };
}

/**
 * Ámbito del docente aplicado **después** de lo que pide la URL.
 *
 * Es el mismo orden que impone `filtroDeListado()` en notas y asistencia, y
 * por el mismo motivo: escrito al revés, un `?teacherId=` en la petición
 * sobrescribiría el acotado y devolvería las actividades de otro docente con
 * un 200 impecable.
 */
async function filtroConAlcance(
  filtro: FiltroActividades,
  usuario: Solicitante,
): Promise<Record<string, unknown>> {
  const query: Record<string, unknown> = { deletedAt: null };

  if (filtro.subjectId) query.subjectId = filtro.subjectId;
  if (filtro.groupId) query.groupId = filtro.groupId;
  if (filtro.period) query.period = filtro.period;
  if (filtro.q) query.title = { $regex: filtro.q.slice(0, 60), $options: 'i' };
  if (filtro.desde || filtro.hasta) {
    query.dueAt = {
      ...(filtro.desde ? { $gte: filtro.desde } : {}),
      ...(filtro.hasta ? { $lte: filtro.hasta } : {}),
    };
  }

  // El rol manda, y va al final.
  if (usuario.role === 'PROFESSOR') query.teacherId = usuario.id;
  if (usuario.role === 'STUDENT') {
    // Un estudiante ve las actividades de las materias donde está matriculado.
    // Se resuelve con su ficha, nunca con lo que declare el cliente.
    query.subjectId = { $in: await materiasDelEstudiante(usuario.studentId) };
  }

  // `CLOSED` y `OPEN` sí se pueden filtrar en Mongo; `LATE` no existe guardado.
  if (filtro.estado === 'CLOSED') query.status = 'CLOSED';
  if (filtro.estado === 'OPEN') query.status = { $ne: 'CLOSED' };
  if (filtro.estado === 'LATE') {
    query.status = { $ne: 'CLOSED' };
    query.dueAt = { ...(query.dueAt as object), $lt: new Date() };
  }

  return query;
}

/**
 * Listado paginado.
 *
 * `LATE` se filtra en la consulta (`dueAt < ahora` y no cerrada) y no en
 * memoria: filtrar después de paginar devolvería páginas de tamaños distintos
 * y un `total` que no coincide con lo que se ve.
 */
export async function listar(
  filtro: FiltroActividades,
  pagina: campo.Paginacion,
  usuario: Solicitante,
) {
  const query = await filtroConAlcance(filtro, usuario);
  const { skip, limit } = campo.saltoYTope(pagina);

  const [documentos, total] = await Promise.all([
    ActivityModel.find(query).sort({ dueAt: -1 }).skip(skip).limit(limit).lean(),
    ActivityModel.countDocuments(query),
  ]);

  const ahora = new Date();
  return { items: documentos.map(d => conEstadoDerivado(d as ActividadPlana, ahora)), total };
}

export async function obtener(id: string, usuario: Solicitante) {
  if (!Types.ObjectId.isValid(id)) throw new ErrorDeActividad('Not found', 404);
  const documento = await ActivityModel.findOne({ _id: id, deletedAt: null }).lean();
  if (!documento) throw new ErrorDeActividad('Not found', 404);
  await exigirAcceso(documento as ActividadPlana, usuario);
  return conEstadoDerivado(documento as ActividadPlana);
}

/**
 * ¿Puede este usuario tocar esta actividad?
 *
 * Se comprueba por documento y no solo al listar: filtrar el listado deja la
 * ficha individual accesible a cualquiera que copie un id, que es exactamente
 * el agujero que ya costó caro en `GET /students/:id`.
 */
async function exigirAcceso(documento: ActividadPlana, usuario: Solicitante): Promise<void> {
  if (usuario.role === 'ADMIN' || usuario.role === 'COORDINATOR') return;
  if (usuario.role === 'PROFESSOR') {
    if (String(documento.teacherId) !== usuario.id) throw new ErrorDeActividad('Forbidden', 403);
    return;
  }
  // Estudiante: solo si la materia está entre sus matrículas.
  const materias = await materiasDelEstudiante(usuario.studentId);
  if (!materias.includes(String(documento.subjectId))) {
    throw new ErrorDeActividad('Forbidden', 403);
  }
}

export type EntradaActividad = {
  title: string;
  description?: string;
  subjectId: string;
  groupId?: string | null;
  teacherId: string;
  period?: string;
  dueAt: Date;
  weight?: number;
  attachmentUrl?: string | null;
};

/**
 * Comprueba que el docente pueda crear/editar sobre esa materia y grupo.
 *
 * **Nunca acepta el `teacherId` del cuerpo como prueba de propiedad**: un
 * docente que enviara el id de otro se estaría autoasignando sus materias.
 * Para PROFESSOR el `teacherId` se fuerza al de la sesión.
 */
async function normalizarPropiedad(
  entrada: EntradaActividad,
  usuario: Solicitante,
): Promise<EntradaActividad> {
  if (usuario.role !== 'PROFESSOR') return entrada;

  const alcance = await getProfessorScope(usuario.id);
  if (!alcance.subjectIds.includes(entrada.subjectId)) {
    throw new ErrorDeActividad('La materia no está asignada a este docente.', 403);
  }
  if (entrada.groupId && !alcance.groupIds.includes(entrada.groupId)) {
    throw new ErrorDeActividad('El grupo no está asignado a este docente.', 403);
  }
  return { ...entrada, teacherId: usuario.id };
}

/** Periodo de la actividad: el que se indique o, si no, el del grupo. */
async function resolverPeriodo(entrada: EntradaActividad): Promise<string> {
  if (entrada.period) return entrada.period;
  if (!entrada.groupId) return '';
  const grupo = await GroupModel.findById(entrada.groupId).select('period').lean();
  return String(grupo?.period ?? '');
}

export async function crear(entrada: EntradaActividad, usuario: Solicitante) {
  const normalizada = await normalizarPropiedad(entrada, usuario);
  const period = await resolverPeriodo(normalizada);

  const documento = await ActivityModel.create({ ...normalizada, period, status: 'OPEN' });

  await auditChange({
    actorId: usuario.id,
    action: 'CREATE',
    entity: 'Actividad',
    entityId: documento.id,
    after: documento.toObject(),
  });
  avisarCambio(String(documento.teacherId), documento.id, 'create');

  return conEstadoDerivado(documento.toObject() as ActividadPlana);
}

export type CambioActividad = Partial<
  Pick<EntradaActividad, 'title' | 'description' | 'dueAt' | 'weight' | 'attachmentUrl' | 'groupId'>
>;

export async function editar(id: string, cambio: CambioActividad, usuario: Solicitante) {
  const antes = await ActivityModel.findOne({ _id: id, deletedAt: null }).lean();
  if (!antes) throw new ErrorDeActividad('Not found', 404);
  await exigirAcceso(antes as ActividadPlana, usuario);

  if (cambio.groupId && usuario.role === 'PROFESSOR') {
    const alcance = await getProfessorScope(usuario.id);
    if (!alcance.groupIds.includes(cambio.groupId)) {
      throw new ErrorDeActividad('El grupo no está asignado a este docente.', 403);
    }
  }

  const documento = await ActivityModel.findOneAndUpdate(
    { _id: id, deletedAt: null },
    { $set: { ...cambio, updatedBy: usuario.id } },
    { new: true },
  );
  if (!documento) throw new ErrorDeActividad('Not found', 404);

  // Solo se audita lo que cambió: guardar el documento entero dos veces por un
  // ajuste de fecha llena la colección de copias casi idénticas.
  const diff = calcularDiff(antes as Record<string, unknown>, documento.toObject());
  if (diff) {
    await auditChange({
      actorId: usuario.id,
      action: 'UPDATE',
      entity: 'Actividad',
      entityId: documento.id,
      before: diff.before,
      after: diff.after,
    });
  }
  avisarCambio(String(documento.teacherId), documento.id, 'update');

  return conEstadoDerivado(documento.toObject() as ActividadPlana);
}

/**
 * Cierra o reabre.
 *
 * Reabrir solo lo puede hacer ADMIN o COORDINATOR: cerrar una entrega es una
 * decisión del docente, pero deshacerla después de la fecha límite cambia lo
 * que se le puede exigir a un estudiante, y esa no es una decisión que deba
 * poder tomarse sin dejar rastro administrativo.
 */
export async function cambiarEstado(
  id: string,
  nuevo: EstadoPersistido,
  usuario: Solicitante,
) {
  const antes = await ActivityModel.findOne({ _id: id, deletedAt: null }).lean();
  if (!antes) throw new ErrorDeActividad('Not found', 404);
  await exigirAcceso(antes as ActividadPlana, usuario);

  const estadoAnterior = antes.status === 'CLOSED' ? 'CLOSED' : 'OPEN';
  if (estadoAnterior === nuevo) {
    return conEstadoDerivado(antes as ActividadPlana);
  }

  if (nuevo === 'OPEN' && usuario.role === 'PROFESSOR') {
    throw new ErrorDeActividad(
      'Reabrir una actividad cerrada requiere permiso de coordinación.',
      403,
    );
  }

  const marcas =
    nuevo === 'CLOSED'
      ? { closedAt: new Date(), closedBy: usuario.id }
      : { reopenedAt: new Date(), reopenedBy: usuario.id };

  const documento = await ActivityModel.findOneAndUpdate(
    { _id: id, deletedAt: null },
    { $set: { status: nuevo, ...marcas, updatedBy: usuario.id } },
    { new: true },
  );
  if (!documento) throw new ErrorDeActividad('Not found', 404);

  await auditChange({
    actorId: usuario.id,
    action: nuevo === 'CLOSED' ? 'activity.close' : 'activity.reopen',
    entity: 'Actividad',
    entityId: documento.id,
    before: { status: estadoAnterior },
    after: { status: nuevo },
  });
  avisarCambio(String(documento.teacherId), documento.id, 'update');

  return conEstadoDerivado(documento.toObject() as ActividadPlana);
}

/**
 * Eliminación lógica.
 *
 * Borrado real no: una actividad referenciada por la agenda y por un aviso ya
 * enviado dejaría dos punteros a la nada, y el docente vería un recordatorio
 * que no abre nada.
 */
export async function eliminar(id: string, usuario: Solicitante): Promise<void> {
  const antes = await ActivityModel.findOne({ _id: id, deletedAt: null }).lean();
  if (!antes) throw new ErrorDeActividad('Not found', 404);
  await exigirAcceso(antes as ActividadPlana, usuario);

  await ActivityModel.updateOne(
    { _id: id },
    { $set: { deletedAt: new Date(), updatedBy: usuario.id } },
  );

  await auditChange({
    actorId: usuario.id,
    action: 'DELETE',
    entity: 'Actividad',
    entityId: id,
    before: { title: antes.title, dueAt: antes.dueAt, status: antes.status },
  });
  avisarCambio(String(antes.teacherId), id, 'delete');
}

/**
 * Avisa del cambio por la sala privada del docente, no por difusión general.
 *
 * Una actividad lleva el título de una evaluación y la fecha de un parcial:
 * emitirla a `role:PROFESSOR` la mandaría a todos los docentes de la
 * institución. `emitToUser` la deja en la sala del dueño más administración.
 */
function avisarCambio(teacherId: string, id: string, accion: string): void {
  emitToUser(teacherId, 'sync:update', { entity: 'activity', action: accion, id });
}
