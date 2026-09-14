/**
 * Vínculos de UniPlanner, gestionados por la institución.
 *
 * El enlace es de la persona con su universidad, no de un curso: se crea una
 * vez y sirve para todas sus materias. Por eso lo gestiona administración o
 * coordinación, y no el docente de una materia:
 *
 * - **Verificar** que el enlace es de quien lo tiene. Lo decide una persona con
 *   el estudiante delante o con su correo institucional: ningún proceso
 *   automático distingue a quien reclamó su código de quien reclamó el de un
 *   compañero.
 * - **Desbloquear** un enlace fijo del semestre, cuando el estudiante se
 *   equivocó de código.
 * - **Liberar** un código que tiene otra cuenta.
 * - **Resolver las solicitudes** que el estudiante manda desde su app.
 *
 * Alcance: administración ve todas las universidades; coordinación y
 * secretaría, la suya y solo los estudiantes de su alcance —su institución, y
 * sus programas si tiene—. Secretaría lee y no escribe (`bloquearSoloLectura`).
 */
import { InstitutionModel } from '../../models/institution.model.js';
import { StudentModel } from '../../models/student.model.js';
import { UserModel } from '../../models/user.model.js';
import { QrBindingModel } from '../../models/qr-binding.model.js';
import { hoyEnElCampus } from '../../shared/class-date.js';
import { auditChange } from '../../shared/audit.js';
import { crearNotificacion } from '../../shared/notify.js';
import * as puente from '../../shared/uniplanner.js';
import { idDeEnlace, normalizarCodigo } from '../../domains/uniplanner/link-id.js';
import {
  accionesDeSolicitud,
  mensajeDeResolucion,
  partesDelEnlace,
  puedeGestionarInstitucion,
  type AccionSolicitud,
  type TipoSolicitud,
} from '../../domains/uniplanner/link-admin.js';
import type { AlcanceDePrograma } from '../../domains/scope/program-scope.js';
import { avisarEnlaceVerificado } from './verificacion.service.js';

export class ErrorDeVinculo extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'ErrorDeVinculo';
  }
}

type Actor = { id: string; role: string; ip?: string | null; userAgent?: string | null };

type Contexto = {
  /** Claves de institución que puede gestionar; `null` = todas (ADMIN). */
  gestionables: string[] | null;
  /** Estudiantes que puede ver; `null` = todos los de sus instituciones. */
  visibles: Set<string> | null;
};

/** Quién puede ver qué, a partir de la sesión y del alcance ya cargado. */
async function contextoDe(actor: Actor, alcance: AlcanceDePrograma | undefined): Promise<Contexto> {
  if (actor.role === 'ADMIN') return { gestionables: null, visibles: null };

  const institucionId = alcance?.institutionId ?? null;
  const institucion = institucionId
    ? await InstitutionModel.findById(institucionId).select('institutionId').lean<{ institutionId?: string } | null>()
    : null;
  return {
    gestionables: institucion?.institutionId ? [institucion.institutionId] : [],
    visibles: alcance && !alcance.total ? new Set(alcance.studentIds.map(String)) : null,
  };
}

function exigirInstitucion(ctx: Contexto, institucion: string): void {
  // Fuera de su alcance es lo mismo que no existir: un 403 diría que la
  // universidad está en el catálogo y quién estudia allí.
  if (!puedeGestionarInstitucion(ctx.gestionables, institucion)) {
    throw new ErrorDeVinculo(404, 'No gestionas esa institución.');
  }
}

/** Las universidades que el actor puede gestionar, para el selector. */
export async function institucionesGestionables(actor: Actor, alcance?: AlcanceDePrograma) {
  const ctx = await contextoDe(actor, alcance);
  const filtro: Record<string, unknown> = { deletedAt: null, activa: { $ne: false } };
  if (ctx.gestionables !== null) filtro.institutionId = { $in: ctx.gestionables };
  const instituciones = await InstitutionModel.find(filtro).select('institutionId nombre sigla').lean();
  return instituciones.map((i) => ({
    institutionId: String(i.institutionId),
    nombre: String(i.nombre ?? ''),
    sigla: String(i.sigla ?? ''),
  }));
}

type EstudianteDeVinculo = { id: string; fullName: string; code: string; program: string; email: string | null };

export type Vinculo = {
  linkId: string;
  codigo: string;
  enlazado: boolean;
  verificado: boolean;
  verificadoEn: string | null;
  bloqueadoHasta: string | null;
  enlazadoEn: string | null;
  /**
   * Cómo está la verificación: `automatica` (documento, nombre y universidad
   * casaron solos), `manual` (la marcó la institución), `no_coincide`,
   * `pendiente` (aún no se comprobó) o `sin_nombre` (enlace anterior a la
   * verificación automática: la persona tiene que añadir su nombre).
   */
  verificacion: 'automatica' | 'manual' | 'no_coincide' | 'pendiente' | 'sin_nombre' | null;
  /** El nombre que escribió la persona en UniPlanner. Para resolver un «no coincide». */
  nombreEnUniPlanner: string | null;
  /** El estudiante de Nexus con ese documento, o `null` si no hay ninguno. */
  estudiante: EstudianteDeVinculo | null;
};

function aVinculo(
  linkId: string,
  codigo: string,
  datos: Record<string, unknown> | null,
  estudiante: EstudianteDeVinculo | null,
): Vinculo {
  const fecha = (valor: unknown) => (valor instanceof Date ? valor.toISOString() : null);
  const bloqueo = datos?.lockedUntil instanceof Date && datos.lockedUntil > new Date() ? datos.lockedUntil : null;
  return {
    linkId,
    codigo,
    enlazado: datos !== null,
    verificado: datos?.verified === true,
    verificadoEn: fecha(datos?.verifiedAt),
    bloqueadoHasta: fecha(bloqueo),
    enlazadoEn: fecha(datos?.linkedAt),
    verificacion: estadoDeVerificacion(datos),
    nombreEnUniPlanner: typeof datos?.fullName === 'string' && datos.fullName ? datos.fullName.slice(0, 120) : null,
    estudiante,
  };
}

function estadoDeVerificacion(datos: Record<string, unknown> | null): Vinculo['verificacion'] {
  if (!datos) return null;
  if (datos.verified === true) return datos.verificationStatus === 'verified' ? 'automatica' : 'manual';
  if (typeof datos.fullName !== 'string' || !datos.fullName.trim()) return 'sin_nombre';
  return datos.verificationStatus === 'not_matched' ? 'no_coincide' : 'pendiente';
}

async function estudiantesPorCodigo(codigos: string[], ctx: Contexto) {
  if (codigos.length === 0) return new Map<string, EstudianteDeVinculo>();
  const filtro: Record<string, unknown> = { code: { $in: codigos }, deletedAt: null };
  if (ctx.visibles) filtro._id = { $in: [...ctx.visibles] };
  const estudiantes = await StudentModel.find(filtro).select('fullName code program email').lean();
  return new Map(
    estudiantes.map((e) => [
      normalizarCodigo(String(e.code)),
      {
        id: String(e._id),
        fullName: String(e.fullName ?? ''),
        code: String(e.code ?? ''),
        program: String(e.program ?? ''),
        email: (e.email as string | null) ?? null,
      },
    ]),
  );
}

const escaparRegex = (texto: string) => texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export type FiltroVinculos = 'todos' | 'sin-verificar' | 'verificados' | 'fijos';

/**
 * Los enlaces de una universidad, o la búsqueda de un estudiante.
 *
 * Sin búsqueda, recorre los enlaces de esa institución en Firestore por
 * páginas. Con búsqueda (código o nombre, desde 3 caracteres) parte de los
 * estudiantes de Nexus: así también sale quien **no** tiene UniPlanner, que es
 * justo lo que se pregunta cuando alguien dice «no me llegan los avisos».
 *
 * Coordinación no ve enlaces cuyo código no es de un estudiante de su alcance:
 * no puede saber de qué carrera es, y enseñarlo sería enseñar quién estudia en
 * otra.
 */
export async function listarVinculos(
  datos: { institucion: string; filtro: FiltroVinculos; q?: string; despuesDe?: string | null },
  actor: Actor,
  alcance?: AlcanceDePrograma,
): Promise<{ items: Vinculo[]; siguiente: string | null }> {
  const ctx = await contextoDe(actor, alcance);
  exigirInstitucion(ctx, datos.institucion);

  const q = datos.q?.trim() ?? '';
  if (q.length >= 3) {
    const filtro: Record<string, unknown> = {
      deletedAt: null,
      $or: [{ code: { $regex: escaparRegex(normalizarCodigo(q) || q) } }, { fullName: { $regex: escaparRegex(q), $options: 'i' } }],
    };
    if (ctx.visibles) filtro._id = { $in: [...ctx.visibles] };
    const estudiantes = await StudentModel.find(filtro).select('fullName code program email').limit(30).lean();
    const porLink = new Map<string, EstudianteDeVinculo>();
    for (const e of estudiantes) {
      const id = idDeEnlace(datos.institucion, String(e.code ?? ''));
      if (!id) continue;
      porLink.set(id, {
        id: String(e._id),
        fullName: String(e.fullName ?? ''),
        code: String(e.code ?? ''),
        program: String(e.program ?? ''),
        email: (e.email as string | null) ?? null,
      });
    }
    const documentos = await Promise.all(
      [...porLink.keys()].map(async (linkId) => [linkId, await puente.leerDocumento(`institution_links/${linkId}`)] as const),
    );
    const items = documentos.map(([linkId, lectura]) => {
      const estudiante = porLink.get(linkId)!;
      const datosEnlace = lectura.ok ? (lectura.documento?.datos ?? null) : null;
      return aVinculo(linkId, partesDelEnlace(linkId)?.codigo ?? '', datosEnlace, estudiante);
    });
    return { items: items.filter((v) => cumpleFiltro(v, datos.filtro)), siguiente: null };
  }

  const pagina = await puente.consultarColeccion(
    'institution_links',
    { institutionId: datos.institucion },
    { limite: 100, despuesDe: datos.despuesDe ?? null },
  );
  if (!pagina.ok) throw new ErrorDeVinculo(424, 'No se pudo leer UniPlanner. Revisa la conexión del servidor.');

  const codigos = pagina.documentos.map((d) => partesDelEnlace(d.id)?.codigo ?? '').filter(Boolean);
  const porCodigo = await estudiantesPorCodigo(codigos, ctx);
  const items: Vinculo[] = [];
  for (const documento of pagina.documentos) {
    const partes = partesDelEnlace(documento.id);
    if (!partes) continue;
    const estudiante = porCodigo.get(partes.codigo) ?? null;
    if (ctx.visibles && !estudiante) continue;
    const vinculo = aVinculo(documento.id, partes.codigo, documento.datos, estudiante);
    if (cumpleFiltro(vinculo, datos.filtro)) items.push(vinculo);
  }
  const ultimo = pagina.documentos.at(-1);
  return { items, siguiente: pagina.documentos.length === 100 && ultimo ? ultimo.nombre : null };
}

function cumpleFiltro(v: Vinculo, filtro: FiltroVinculos): boolean {
  switch (filtro) {
    case 'sin-verificar':
      return v.enlazado && !v.verificado;
    case 'verificados':
      return v.verificado;
    case 'fijos':
      return v.bloqueadoHasta !== null;
    default:
      return true;
  }
}

export type AccionVinculo = 'verificar' | 'desverificar' | 'desbloquear' | 'liberar';

/**
 * Suelta en Nexus el vínculo del semestre (`QrBindingModel`) de una cuenta y un
 * estudiante. Quitar el bloqueo o liberar el código solo en Firestore no
 * bastaría: el lector de QR seguiría rechazando la cuenta nueva como
 * `CUENTA_CAMBIADA`, que es justo lo que la institución acaba de autorizar.
 */
async function soltarVinculosQr(uids: string[], studentId: string | null): Promise<void> {
  const condiciones: Record<string, unknown>[] = [];
  const limpios = uids.filter(Boolean);
  if (limpios.length > 0) condiciones.push({ uid: { $in: limpios } });
  if (studentId) condiciones.push({ studentId });
  if (condiciones.length > 0) await QrBindingModel.deleteMany({ $or: condiciones });
}

/**
 * Cambia un enlace. Si el estudiante había pedido justo eso desde su app, la
 * solicitud queda resuelta: resolverlo desde la lista y dejar la solicitud
 * pendiente sería contestarle dos veces, o ninguna.
 */
export async function cambiarVinculo(
  linkId: string,
  accion: AccionVinculo,
  actor: Actor,
  alcance?: AlcanceDePrograma,
): Promise<Vinculo> {
  const ctx = await contextoDe(actor, alcance);
  const partes = partesDelEnlace(linkId);
  if (!partes) throw new ErrorDeVinculo(400, 'Identificador de enlace inválido.');
  exigirInstitucion(ctx, partes.institucion);

  const estudiante = (await estudiantesPorCodigo([partes.codigo], ctx)).get(partes.codigo) ?? null;
  if (ctx.visibles && !estudiante) throw new ErrorDeVinculo(404, 'Ese estudiante no está en tu alcance.');

  const lectura = await puente.leerDocumento(`institution_links/${linkId}`);
  if (!lectura.ok) throw new ErrorDeVinculo(424, 'No se pudo leer UniPlanner. Revisa la conexión del servidor.');
  const enlace = lectura.documento;
  if (!enlace) throw new ErrorDeVinculo(404, 'Ese documento no tiene ningún enlace de UniPlanner.');

  const escrito = await (async () => {
    switch (accion) {
      case 'verificar':
        return puente.marcarVerificacion(linkId, true);
      case 'desverificar':
        return puente.marcarVerificacion(linkId, false);
      case 'desbloquear':
        return puente.desbloquearEnlace(linkId);
      case 'liberar':
        return puente.liberarEnlace(linkId);
    }
  })();
  if (!escrito) throw new ErrorDeVinculo(424, 'No se pudo escribir en UniPlanner. Revisa la conexión del servidor.');

  const titular = typeof enlace.datos.uid === 'string' ? enlace.datos.uid : '';
  if (accion === 'verificar' && enlace.datos.verified !== true) {
    await avisarEnlaceVerificado(titular, partes.institucion, linkId);
  }
  if (accion === 'desbloquear' || accion === 'liberar') await soltarVinculosQr([titular], estudiante?.id ?? null);
  if ((accion === 'desbloquear' || accion === 'liberar') && titular) {
    const solicitud = await puente.leerDocumento(`link_requests/${encodeURIComponent(titular)}`);
    const datos = solicitud.ok ? solicitud.documento?.datos : null;
    if (datos?.status === 'pending' && datos.institutionId === partes.institucion) {
      await puente.resolverSolicitudEnlace(titular, {
        status: 'approved',
        action: accion,
        message: mensajeDeResolucion(accion),
      });
    }
  }

  await auditChange({
    actorId: actor.id,
    action: 'UPDATE',
    entity: 'EnlaceUniPlanner',
    entityId: estudiante?.id ?? null,
    before: {
      verificado: enlace.datos.verified === true,
      bloqueadoHasta: enlace.datos.lockedUntil instanceof Date ? enlace.datos.lockedUntil.toISOString() : null,
    },
    after: { accion, linkId },
    ip: actor.ip ?? null,
    userAgent: actor.userAgent ?? null,
  });

  if (accion === 'liberar') return aVinculo(linkId, partes.codigo, null, estudiante);
  const actual = await puente.leerDocumento(`institution_links/${linkId}`);
  return aVinculo(linkId, partes.codigo, actual.ok ? (actual.documento?.datos ?? null) : null, estudiante);
}

// ── Solicitudes de los estudiantes ───────────────────────────────────────────

export type Solicitud = {
  uid: string;
  tipo: TipoSolicitud;
  codigo: string;
  motivo: string;
  creadaEn: string | null;
  estudiante: EstudianteDeVinculo | null;
  /** El enlace de ese código ahora mismo. */
  enlace: { existe: boolean; esDeQuienPide: boolean; verificado: boolean; bloqueadoHasta: string | null };
  acciones: AccionSolicitud[];
};

/** Las solicitudes pendientes de una universidad. */
export async function listarSolicitudes(
  institucion: string,
  actor: Actor,
  alcance?: AlcanceDePrograma,
): Promise<Solicitud[]> {
  const ctx = await contextoDe(actor, alcance);
  exigirInstitucion(ctx, institucion);

  const lectura = await puente.consultarColeccion(
    'link_requests',
    { institutionId: institucion, status: 'pending' },
    { limite: 200 },
  );
  if (!lectura.ok) throw new ErrorDeVinculo(424, 'No se pudo leer UniPlanner. Revisa la conexión del servidor.');

  const pedidas = lectura.documentos.map((d) => ({
    uid: d.id,
    datos: d.datos,
    codigo: normalizarCodigo(String(d.datos.studentCode ?? '')),
  }));
  const porCodigo = await estudiantesPorCodigo(pedidas.map((p) => p.codigo), ctx);
  const enlaces = await puente.buscarEnlaces(
    pedidas.map((p) => idDeEnlace(institucion, p.codigo)).filter((id): id is string => Boolean(id)),
  );

  return pedidas
    .filter((p) => !ctx.visibles || porCodigo.has(p.codigo))
    .map((p) => {
      const tipo: TipoSolicitud = p.datos.type === 'claimed' ? 'claimed' : 'unlock';
      const enlace = enlaces.get(idDeEnlace(institucion, p.codigo) ?? '');
      const esDeQuienPide = enlace?.uid === p.uid;
      const bloqueo = enlace?.bloqueadoHasta && enlace.bloqueadoHasta > new Date() ? enlace.bloqueadoHasta : null;
      return {
        uid: p.uid,
        tipo,
        codigo: p.codigo,
        motivo: String(p.datos.reason ?? ''),
        creadaEn: p.datos.createdAt instanceof Date ? p.datos.createdAt.toISOString() : null,
        estudiante: porCodigo.get(p.codigo) ?? null,
        enlace: {
          existe: Boolean(enlace),
          esDeQuienPide,
          verificado: Boolean(enlace?.verified),
          bloqueadoHasta: bloqueo?.toISOString() ?? null,
        },
        acciones: enlace ? accionesDeSolicitud(tipo, esDeQuienPide) : ['rechazar'],
      };
    });
}

/** Resuelve una solicitud: hace lo que se decidió y se lo contesta al estudiante. */
export async function resolverSolicitud(
  uid: string,
  decision: { accion: AccionSolicitud; nota?: string },
  actor: Actor,
  alcance?: AlcanceDePrograma,
): Promise<void> {
  const ctx = await contextoDe(actor, alcance);
  const lectura = await puente.leerDocumento(`link_requests/${encodeURIComponent(uid)}`);
  if (!lectura.ok) throw new ErrorDeVinculo(424, 'No se pudo leer UniPlanner. Revisa la conexión del servidor.');
  const datos = lectura.documento?.datos;
  if (!datos || datos.status !== 'pending') throw new ErrorDeVinculo(404, 'Esa solicitud ya no está pendiente.');

  const institucion = String(datos.institutionId ?? '');
  exigirInstitucion(ctx, institucion);
  const codigo = normalizarCodigo(String(datos.studentCode ?? ''));
  const estudiante = (await estudiantesPorCodigo([codigo], ctx)).get(codigo) ?? null;
  if (ctx.visibles && !estudiante) throw new ErrorDeVinculo(404, 'Esa solicitud no está en tu alcance.');

  const linkId = idDeEnlace(institucion, codigo);
  const enlace = linkId ? await puente.buscarEnlace(linkId) : null;
  const tipo: TipoSolicitud = datos.type === 'claimed' ? 'claimed' : 'unlock';
  const permitidas = enlace ? accionesDeSolicitud(tipo, enlace.uid === uid) : ['rechazar'];
  if (!permitidas.includes(decision.accion)) {
    throw new ErrorDeVinculo(409, 'Esa acción no corresponde a esta solicitud.');
  }

  if (decision.accion !== 'rechazar' && linkId) {
    const hecho =
      decision.accion === 'desbloquear'
        ? await puente.desbloquearEnlace(linkId)
        : decision.accion === 'asignar'
          ? await puente.asignarEnlace(linkId, uid)
          : await puente.liberarEnlace(linkId);
    if (!hecho) throw new ErrorDeVinculo(424, 'No se pudo escribir en UniPlanner. Revisa la conexión del servidor.');
    await soltarVinculosQr([uid, enlace?.uid ?? ''], estudiante?.id ?? null);
  }

  // La auditoría va **antes** de contestar: si la respuesta falla, la acción
  // —que puede haber borrado un enlace— ya quedó hecha y tiene que constar.
  await auditChange({
    actorId: actor.id,
    action: 'UPDATE',
    entity: 'SolicitudEnlaceUniPlanner',
    entityId: estudiante?.id ?? null,
    before: { status: 'pending', tipo, codigo },
    after: { accion: decision.accion, nota: decision.nota ?? '' },
    ip: actor.ip ?? null,
    userAgent: actor.userAgent ?? null,
  });

  const contestada = await puente.resolverSolicitudEnlace(uid, {
    status: decision.accion === 'rechazar' ? 'rejected' : 'approved',
    action: decision.accion,
    message: mensajeDeResolucion(decision.accion, decision.nota),
  });
  if (!contestada) {
    throw new ErrorDeVinculo(
      424,
      decision.accion === 'rechazar'
        ? 'No se pudo contestar al estudiante en UniPlanner.'
        : 'El enlace se cambió, pero no se pudo contestar al estudiante en UniPlanner. Vuelve a intentarlo.',
    );
  }
}

/**
 * Avisa a administración y a la coordinación de cada universidad de las
 * solicitudes nuevas. Lo llama el scheduler cada pocos minutos.
 *
 * Sin esto la solicitud esperaría a que alguien abriera la pantalla por su
 * cuenta, y el estudiante con el enlace equivocado seguiría sin poder marcar
 * asistencia. El `dedupeKey` es la cuenta y el **día**: cada pasada vuelve a
 * ver las pendientes y no repite el aviso, y borrar la solicitud y crearla otra
 * vez —que las reglas permiten— no vuelve a avisar a toda la administración
 * cada cinco minutos.
 */
export async function avisarSolicitudesNuevas(): Promise<{ avisos: number }> {
  const lectura = await puente.consultarColeccion('link_requests', { status: 'pending' }, { limite: 200 });
  if (!lectura.ok || lectura.documentos.length === 0) return { avisos: 0 };

  const admins = await UserModel.find({ role: 'ADMIN', deletedAt: null }).select('_id').lean();
  const coordinacionPorInstitucion = new Map<string, string[]>();
  let avisos = 0;

  for (const documento of lectura.documentos) {
    const institucion = String(documento.datos.institutionId ?? '');
    if (!coordinacionPorInstitucion.has(institucion)) {
      const perfil = await InstitutionModel.findOne({ institutionId: institucion }).select('_id').lean();
      const coordinacion = perfil
        ? await UserModel.find({ role: 'COORDINATOR', institutionId: perfil._id, deletedAt: null }).select('_id').lean()
        : [];
      coordinacionPorInstitucion.set(institucion, coordinacion.map((u) => String(u._id)));
    }

    const dia = hoyEnElCampus();
    const codigo = normalizarCodigo(String(documento.datos.studentCode ?? ''));
    const tipo = documento.datos.type === 'claimed' ? 'su documento lo tiene otra cuenta' : 'quiere cambiar su enlace';
    const destinatarios = new Set([
      ...admins.map((a) => String(a._id)),
      ...(coordinacionPorInstitucion.get(institucion) ?? []),
    ]);
    for (const userId of destinatarios) {
      const resultado = await crearNotificacion({
        userId,
        title: 'Solicitud de enlace de UniPlanner',
        message: `${institucion.toUpperCase()} · ${codigo}: ${tipo}.`,
        type: 'SISTEMA',
        priority: 'IMPORTANT',
        link: '/vinculos-uniplanner',
        dedupeKey: `uniplanner-solicitud:${documento.id}:${dia}`,
      });
      if (resultado.creada) avisos++;
    }
  }
  return { avisos };
}
