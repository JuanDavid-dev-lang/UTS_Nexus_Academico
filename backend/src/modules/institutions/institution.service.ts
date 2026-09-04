import { Types } from 'mongoose';
import { InstitutionModel } from '../../models/institution.model.js';
import { ProfessorModel } from '../../models/professor.model.js';
import {
  buscarCoincidencias,
  clavesDePerfil,
  generarInstitutionId,
  limpiarAliases,
  validarConfiguracionAcademica,
  validarPerfil,
  type Coincidencia,
  type ConfiguracionAcademica,
  type ErrorPerfil,
} from '../../domains/institutions/institution-profile.js';

/**
 * Acceso a datos de los perfiles institucionales.
 *
 * Las rutas no tocan `InstitutionModel`: aquí se decide qué es un duplicado,
 * qué se puede borrar y qué forma tiene lo que sale. Las reglas puras viven
 * en `domains/institutions`; esto solo las aplica contra la base.
 */

export type InstitucionDto = {
  id: string;
  institutionId: string;
  nombre: string;
  sigla: string;
  aliases: string[];
  activa: boolean;
  configuracionAcademica: ConfiguracionAcademica | null;
  configuradaEn: Date | null;
  /** Docentes vinculados. Solo en listados y fichas, no en el selector público. */
  docentes?: number;
  createdAt?: Date;
  updatedAt?: Date;
};

/** Lo que ve el selector del registro: identidad, nada más. */
export type InstitucionPublica = { id: string; institutionId: string; nombre: string; sigla: string };

/** Error de negocio con código HTTP. `shared/error.ts` lo traduce tal cual. */
export class ErrorInstitucion extends Error {
  statusCode: number;
  errores: ErrorPerfil[];
  coincidencias?: Coincidencia<InstitucionPublica>[];

  constructor(statusCode: number, mensaje: string, errores: ErrorPerfil[] = []) {
    super(mensaje);
    this.statusCode = statusCode;
    this.errores = errores;
  }
}

type InstitucionCruda = {
  _id: unknown;
  institutionId: string;
  nombre: string;
  sigla: string;
  aliases?: string[] | null;
  activa?: boolean | null;
  configuracionAcademica?: ConfiguracionAcademica | null;
  configuradaEn?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
};

function aDto(doc: InstitucionCruda, docentes?: number): InstitucionDto {
  const config = doc.configuracionAcademica;
  return {
    id: String(doc._id),
    institutionId: doc.institutionId,
    nombre: doc.nombre,
    sigla: doc.sigla,
    aliases: doc.aliases ?? [],
    activa: doc.activa !== false,
    configuracionAcademica: config
      ? {
          cortes: config.cortes.map(c => ({ numero: c.numero, nombre: c.nombre, peso: c.peso })),
          componentes: config.componentes.map(c => ({ id: c.id, nombre: c.nombre, peso: c.peso })),
          notaMinima: config.notaMinima,
          notaMaxima: config.notaMaxima,
          notaAprobacion: config.notaAprobacion,
        }
      : null,
    configuradaEn: doc.configuradaEn ?? null,
    ...(docentes === undefined ? {} : { docentes }),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function aPublica(doc: InstitucionCruda): InstitucionPublica {
  return { id: String(doc._id), institutionId: doc.institutionId, nombre: doc.nombre, sigla: doc.sigla };
}

/** Filtro por `_id` o por `institutionId`: la URL admite los dos. */
function filtroPorId(idOSlug: string): Record<string, unknown> {
  const base = { deletedAt: null };
  return Types.ObjectId.isValid(idOSlug) && idOSlug.length === 24
    ? { ...base, _id: idOSlug }
    : { ...base, institutionId: idOSlug.trim().toLowerCase() };
}

// ── Lectura ─────────────────────────────────────────────────────────────────

/** Instituciones activas para un selector. Sin conteos ni configuración. */
export async function listarActivas(): Promise<InstitucionPublica[]> {
  const docs = await InstitutionModel.find({ deletedAt: null, activa: true })
    .select('_id institutionId nombre sigla')
    .sort({ nombre: 1 })
    .lean();
  return docs.map(aPublica);
}

async function contarDocentesPorInstitucion(ids: unknown[]): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map();
  const filas = await ProfessorModel.aggregate<{ _id: unknown; total: number }>([
    { $match: { institutionId: { $in: ids }, deletedAt: null } },
    { $group: { _id: '$institutionId', total: { $sum: 1 } } },
  ]);
  return new Map(filas.map(fila => [String(fila._id), fila.total]));
}

export async function listarInstituciones(filtro: {
  q?: string;
  activa?: boolean;
}): Promise<InstitucionDto[]> {
  const query: Record<string, unknown> = { deletedAt: null };
  if (filtro.activa !== undefined) query.activa = filtro.activa;
  if (filtro.q) {
    const patron = new RegExp(filtro.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    query.$or = [{ nombre: patron }, { sigla: patron }, { aliases: patron }, { institutionId: patron }];
  }
  const docs = await InstitutionModel.find(query).sort({ activa: -1, nombre: 1 }).lean();
  const conteos = await contarDocentesPorInstitucion(docs.map(d => d._id));
  return docs.map(doc => aDto(doc, conteos.get(String(doc._id)) ?? 0));
}

export async function obtenerInstitucion(idOSlug: string): Promise<InstitucionDto | null> {
  const doc = await InstitutionModel.findOne(filtroPorId(idOSlug)).lean();
  if (!doc) return null;
  const docentes = await ProfessorModel.countDocuments({ institutionId: doc._id, deletedAt: null });
  return aDto(doc, docentes);
}

/**
 * Posibles duplicados de una candidata, contra todos los perfiles (también
 * los desactivados: uno desactivado sigue existiendo, y crearlo de nuevo
 * dejaría dos historiales de la misma universidad).
 */
export async function coincidenciasDe(
  candidata: { nombre: string; sigla?: string; aliases?: string[] },
  excluirId?: string,
): Promise<Coincidencia<InstitucionPublica & { activa: boolean }>[]> {
  const docs = await InstitutionModel.find({ deletedAt: null })
    .select('_id institutionId nombre sigla aliases activa')
    .lean();
  const perfiles = docs.map(doc => ({ ...aPublica(doc), aliases: doc.aliases ?? [], activa: doc.activa !== false }));
  return buscarCoincidencias(candidata, perfiles, excluirId).map(c => ({
    ...c,
    perfil: { id: c.perfil.id, institutionId: c.perfil.institutionId, nombre: c.perfil.nombre, sigla: c.perfil.sigla, activa: c.perfil.activa },
  }));
}

// ── Escritura ───────────────────────────────────────────────────────────────

export type DatosInstitucion = {
  /** Opcional: si no viene, se genera desde la sigla (`unab`, `unab-2`…). */
  institutionId?: string | null;
  nombre: string;
  sigla: string;
  aliases?: string[];
  activa?: boolean;
};

function limpiar(datos: DatosInstitucion & { institutionId: string }) {
  return {
    institutionId: datos.institutionId.trim().toLowerCase(),
    nombre: datos.nombre.replace(/\s+/g, ' ').trim(),
    sigla: datos.sigla.trim().toUpperCase(),
    aliases: limpiarAliases(datos.aliases),
  };
}

/**
 * Rechaza si alguna clave de la candidata ya pertenece a otro perfil. Las
 * coincidencias «posibles» no bloquean: se avisan por `GET /coincidencias`
 * y quien crea decide.
 */
async function exigirSinDuplicados(
  datos: { nombre: string; sigla: string; aliases: string[] },
  excluirId?: string,
): Promise<void> {
  const coincidencias = await coincidenciasDe(datos, excluirId);
  const exactas = coincidencias.filter(c => c.tipo === 'exacta');
  if (exactas.length === 0) return;
  const primera = exactas[0]!;
  const error = new ErrorInstitucion(
    409,
    `Ya existe «${primera.perfil.nombre}» (${primera.perfil.sigla}): ${primera.motivo} ` +
      'Si es la misma institución, añade el nombre como alias en vez de crear otro perfil.',
    [{ campo: 'nombre', mensaje: primera.motivo }],
  );
  error.coincidencias = exactas;
  throw error;
}

export async function crearInstitucion(
  datos: DatosInstitucion,
  actorId?: string | null,
): Promise<InstitucionDto> {
  // El identificador es automático: sale de la sigla y esquiva los que ya
  // existen (también los borrados lógicamente: un id no se reutiliza). Si el
  // cliente manda uno, se respeta y se valida como antes.
  const institutionId = datos.institutionId?.trim()
    ? datos.institutionId
    : generarInstitutionId(
        datos.sigla,
        datos.nombre,
        (await InstitutionModel.find({}).select('institutionId').lean()).map(d => d.institutionId),
      );
  const limpio = limpiar({ ...datos, institutionId });
  const errores = validarPerfil(limpio);
  if (errores.length > 0) throw new ErrorInstitucion(400, errores[0]!.mensaje, errores);

  if (await InstitutionModel.exists({ institutionId: limpio.institutionId })) {
    throw new ErrorInstitucion(409, `El identificador «${limpio.institutionId}» ya está en uso.`, [
      { campo: 'institutionId', mensaje: 'Identificador duplicado.' },
    ]);
  }
  await exigirSinDuplicados(limpio);

  const doc = await InstitutionModel.create({
    ...limpio,
    clavesBusqueda: clavesDePerfil(limpio),
    activa: datos.activa ?? true,
    configuracionAcademica: null,
    createdBy: actorId ?? null,
  });
  return aDto(doc.toObject(), 0);
}

export type CambiosInstitucion = Partial<Omit<DatosInstitucion, 'institutionId'>>;

export async function actualizarInstitucion(
  idOSlug: string,
  cambios: CambiosInstitucion,
  actorId?: string | null,
): Promise<{ antes: InstitucionDto; despues: InstitucionDto }> {
  const actual = await InstitutionModel.findOne(filtroPorId(idOSlug)).lean();
  if (!actual) throw new ErrorInstitucion(404, 'Institución no encontrada.');

  const limpio = limpiar({
    institutionId: actual.institutionId,
    nombre: cambios.nombre ?? actual.nombre,
    sigla: cambios.sigla ?? actual.sigla,
    aliases: cambios.aliases ?? actual.aliases ?? [],
  });
  const errores = validarPerfil(limpio);
  if (errores.length > 0) throw new ErrorInstitucion(400, errores[0]!.mensaje, errores);
  await exigirSinDuplicados(limpio, actual.institutionId);

  const doc = await InstitutionModel.findOneAndUpdate(
    { _id: actual._id },
    {
      $set: {
        nombre: limpio.nombre,
        sigla: limpio.sigla,
        aliases: limpio.aliases,
        clavesBusqueda: clavesDePerfil(limpio),
        ...(cambios.activa === undefined ? {} : { activa: cambios.activa }),
        updatedBy: actorId ?? null,
      },
    },
    { new: true },
  ).lean();
  if (!doc) throw new ErrorInstitucion(404, 'Institución no encontrada.');

  const docentes = await ProfessorModel.countDocuments({ institutionId: doc._id, deletedAt: null });
  return { antes: aDto(actual, docentes), despues: aDto(doc, docentes) };
}

/** Guarda (o borra, con `null`) los cortes y ponderados. Nunca los inventa. */
export async function configurarInstitucion(
  idOSlug: string,
  config: ConfiguracionAcademica | null,
  actorId?: string | null,
): Promise<{ antes: InstitucionDto; despues: InstitucionDto }> {
  const actual = await InstitutionModel.findOne(filtroPorId(idOSlug)).lean();
  if (!actual) throw new ErrorInstitucion(404, 'Institución no encontrada.');

  if (config) {
    const errores = validarConfiguracionAcademica(config);
    if (errores.length > 0) throw new ErrorInstitucion(400, errores[0]!.mensaje, errores);
  }

  const doc = await InstitutionModel.findOneAndUpdate(
    { _id: actual._id },
    {
      $set: {
        configuracionAcademica: config,
        configuradaPor: config ? actorId ?? null : null,
        configuradaEn: config ? new Date() : null,
        updatedBy: actorId ?? null,
      },
    },
    { new: true },
  ).lean();
  if (!doc) throw new ErrorInstitucion(404, 'Institución no encontrada.');
  return { antes: aDto(actual), despues: aDto(doc) };
}

/**
 * Borrado lógico, y solo sin registros relacionados.
 *
 * Con docentes vinculados —y con ellos sus materias, notas y asistencia— se
 * rechaza con 409: lo que corresponde es desactivarla. Borrar dejaría a esos
 * docentes apuntando a un perfil que no existe y el historial sin institución.
 */
export async function eliminarInstitucion(
  idOSlug: string,
  actorId?: string | null,
): Promise<InstitucionDto> {
  const actual = await InstitutionModel.findOne(filtroPorId(idOSlug)).lean();
  if (!actual) throw new ErrorInstitucion(404, 'Institución no encontrada.');

  // Sin `deletedAt: null` a propósito: una ficha docente borrada lógicamente
  // sigue apuntando aquí con sus notas y su asistencia; el historial también
  // es un registro relacionado.
  const docentes = await ProfessorModel.countDocuments({ institutionId: actual._id });
  if (docentes > 0) {
    throw new ErrorInstitucion(
      409,
      `«${actual.nombre}» tiene ${docentes} docente${docentes === 1 ? '' : 's'} vinculado${docentes === 1 ? '' : 's'}. ` +
        'No se puede eliminar; desactívala para que deje de ofrecerse en el registro.',
    );
  }

  await InstitutionModel.updateOne(
    { _id: actual._id },
    { $set: { deletedAt: new Date(), activa: false, updatedBy: actorId ?? null } },
  );
  return aDto(actual, 0);
}

// ── Docentes ────────────────────────────────────────────────────────────────

export type DocenteDeInstitucion = {
  id: string;
  userId: string;
  cedula: string | null;
  nombre: string;
  email: string;
  estado: string;
  programas: string[];
  institucionSolicitada: string | null;
};

type ProfesorCrudo = {
  _id: unknown;
  userId: unknown;
  cedula?: string | null;
  nombres?: string;
  apellidos?: string;
  estado: string;
  programas?: string[] | null;
  institucionSolicitada?: string | null;
};

function aDocente(doc: ProfesorCrudo): DocenteDeInstitucion {
  const usuario = doc.userId as { _id?: unknown; email?: string; fullName?: string } | null;
  const nombre = `${doc.nombres ?? ''} ${doc.apellidos ?? ''}`.trim() || usuario?.fullName || '';
  return {
    id: String(doc._id),
    userId: String(usuario?._id ?? doc.userId ?? ''),
    cedula: doc.cedula ?? null,
    nombre,
    email: usuario?.email ?? '',
    estado: doc.estado,
    programas: doc.programas ?? [],
    institucionSolicitada: doc.institucionSolicitada ?? null,
  };
}

export async function docentesDe(idOSlug: string): Promise<DocenteDeInstitucion[]> {
  const inst = await InstitutionModel.findOne(filtroPorId(idOSlug)).select('_id').lean();
  if (!inst) throw new ErrorInstitucion(404, 'Institución no encontrada.');
  const docs = await ProfessorModel.find({ institutionId: inst._id, deletedAt: null })
    .populate('userId', 'email fullName')
    .sort({ apellidos: 1, nombres: 1 })
    .limit(2000)
    .lean();
  return docs.map(doc => aDocente(doc as ProfesorCrudo));
}

/**
 * Asigna (o quita, con `null`) la institución de un docente. Devuelve antes y
 * después para la auditoría: quién movió a quién de dónde a dónde.
 */
export async function asignarDocente(
  profesorId: string,
  institucion: string | null,
  actorId?: string | null,
): Promise<{ docente: DocenteDeInstitucion; antes: string | null; despues: string | null; userId: string }> {
  const antes = await ProfessorModel.findOne({ _id: profesorId, deletedAt: null }).lean();
  if (!antes) throw new ErrorInstitucion(404, 'Docente no encontrado.');

  let destino: { _id: unknown; institutionId: string } | null = null;
  if (institucion) {
    destino = await InstitutionModel.findOne(filtroPorId(institucion)).select('_id institutionId').lean();
    if (!destino) throw new ErrorInstitucion(404, 'Institución no encontrada.');
  }

  const doc = await ProfessorModel.findOneAndUpdate(
    { _id: antes._id },
    {
      $set: {
        institutionId: destino ? destino._id : null,
        // Asociarlo resuelve la solicitud; quitárselo la deja tal cual estaba.
        ...(destino ? { institucionSolicitada: null } : {}),
        updatedBy: actorId ?? null,
      },
    },
    { new: true },
  )
    .populate('userId', 'email fullName')
    .lean();
  if (!doc) throw new ErrorInstitucion(404, 'Docente no encontrado.');

  return {
    docente: aDocente(doc as ProfesorCrudo),
    antes: antes.institutionId ? String(antes.institutionId) : null,
    despues: destino ? String(destino._id) : null,
    userId: String(antes.userId),
  };
}

// ── Solicitudes de instituciones que no existen ─────────────────────────────

export type SolicitudInstitucion = DocenteDeInstitucion & {
  institucionSolicitada: string;
  /** Perfiles existentes que podrían ser lo que pidió. */
  coincidencias: Coincidencia<InstitucionPublica & { activa: boolean }>[];
  solicitadaEn?: Date;
};

/** Docentes que pidieron una institución que no estaba en el selector. */
export async function listarSolicitudes(): Promise<SolicitudInstitucion[]> {
  const docs = await ProfessorModel.find({
    deletedAt: null,
    institutionId: null,
    institucionSolicitada: { $nin: [null, ''] },
  })
    .populate('userId', 'email fullName')
    .sort({ createdAt: 1 })
    .limit(500)
    .lean();

  const resultado: SolicitudInstitucion[] = [];
  for (const doc of docs) {
    const base = aDocente(doc as ProfesorCrudo);
    const pedida = base.institucionSolicitada ?? '';
    resultado.push({
      ...base,
      institucionSolicitada: pedida,
      coincidencias: await coincidenciasDe({ nombre: pedida }),
      solicitadaEn: (doc as { createdAt?: Date }).createdAt,
    });
  }
  return resultado;
}

/** Crea el perfil que pidió un docente y lo vincula en el mismo paso. */
export async function crearDesdeSolicitud(
  profesorId: string,
  datos: DatosInstitucion,
  actorId?: string | null,
): Promise<{ institucion: InstitucionDto; asignacion: Awaited<ReturnType<typeof asignarDocente>> }> {
  const solicitante = await ProfessorModel.findOne({ _id: profesorId, deletedAt: null }).select('_id').lean();
  if (!solicitante) throw new ErrorInstitucion(404, 'Docente no encontrado.');

  const institucion = await crearInstitucion(datos, actorId);
  const asignacion = await asignarDocente(profesorId, institucion.id, actorId);
  return { institucion: { ...institucion, docentes: 1 }, asignacion };
}

// ── Registro ────────────────────────────────────────────────────────────────

/**
 * Resuelve lo que el formulario de registro dijo sobre la institución.
 *
 * - Con `institutionId`: tiene que existir y estar activa; una desactivada
 *   no se ofrece y tampoco se acepta si alguien la manda a mano.
 * - Con `institucionSolicitada`: si coincide exactamente con un perfil
 *   activo (nombre, sigla o alias) se vincula directamente —para eso existen
 *   los alias—; si no, queda pendiente para la administración.
 */
export async function resolverInstitucionDeRegistro(input: {
  institutionId?: string | null;
  institucionSolicitada?: string | null;
}): Promise<{ institutionId: Types.ObjectId | null; institucionSolicitada: string | null }> {
  if (input.institutionId) {
    const doc = await InstitutionModel.findOne({ ...filtroPorId(input.institutionId), activa: true })
      .select('_id')
      .lean();
    if (!doc) {
      throw new ErrorInstitucion(400, 'La institución elegida no está disponible para nuevos registros.', [
        { campo: 'institutionId', mensaje: 'Institución no disponible.' },
      ]);
    }
    return { institutionId: doc._id as Types.ObjectId, institucionSolicitada: null };
  }

  const pedida = (input.institucionSolicitada ?? '').replace(/\s+/g, ' ').trim();
  if (!pedida) {
    throw new ErrorInstitucion(400, 'Indica tu institución.', [
      { campo: 'institutionId', mensaje: 'Elige una institución o escribe la tuya.' },
    ]);
  }
  const exacta = (await coincidenciasDe({ nombre: pedida })).find(c => c.tipo === 'exacta' && c.perfil.activa);
  if (exacta) {
    return { institutionId: new Types.ObjectId(exacta.perfil.id), institucionSolicitada: pedida };
  }
  return { institutionId: null, institucionSolicitada: pedida };
}
