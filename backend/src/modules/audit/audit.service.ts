/**
 * Consulta del registro de auditoría: orquestación y acceso a datos.
 *
 * El sistema ya escribía auditoría desde el primer día; lo que no había era
 * forma de leerla sin abrir la base de datos a mano. Este servicio es esa
 * lectura, y nada más: **no escribe auditoría**, que para eso está
 * `shared/audit.ts`.
 *
 * El saneado ocurre al ESCRIBIR (`sanearParaAuditoria`), no aquí. Sanear solo
 * al leer dejaría las contraseñas guardadas en la colección, a salvo de esta
 * pantalla y de nadie más: quien tenga acceso a Mongo las vería igual. Aun
 * así, esta lectura vuelve a pasar el filtro sobre los documentos antiguos,
 * escritos antes de que existiera el saneado.
 */
import { Types } from 'mongoose';
import { AuditModel } from '../../models/audit.model.js';
import { UserModel } from '../../models/user.model.js';
import { sanearValor } from '../../shared/sanitize.js';
import * as campo from '../../shared/validation.js';

export type FiltroAuditoria = {
  actorId?: string;
  action?: string;
  entity?: string;
  entityId?: string;
  desde?: Date;
  hasta?: Date;
  q?: string;
};

type RegistroPlano = Record<string, any>;

function construirQuery(filtro: FiltroAuditoria): Record<string, unknown> {
  const query: Record<string, unknown> = {};

  // Los ids se convierten a mano: el campo es `ObjectId` y una cadena no casa.
  // Un id mal formado se convierte en un filtro imposible en vez de reventar
  // con un `CastError` que `error.ts` traduciría a un 404 desconcertante.
  if (filtro.actorId) {
    query.actorId = Types.ObjectId.isValid(filtro.actorId)
      ? new Types.ObjectId(filtro.actorId)
      : new Types.ObjectId('000000000000000000000000');
  }
  if (filtro.entityId) {
    query.entityId = Types.ObjectId.isValid(filtro.entityId)
      ? new Types.ObjectId(filtro.entityId)
      : new Types.ObjectId('000000000000000000000000');
  }
  if (filtro.action) query.action = filtro.action;
  if (filtro.entity) query.entity = filtro.entity;
  if (filtro.desde || filtro.hasta) {
    query.createdAt = {
      ...(filtro.desde ? { $gte: filtro.desde } : {}),
      ...(filtro.hasta ? { $lte: filtro.hasta } : {}),
    };
  }
  // Búsqueda libre acotada a acción y entidad: buscar dentro de `before`/`after`
  // obligaría a un recorrido completo de una colección que solo crece.
  if (filtro.q) {
    const texto = filtro.q.slice(0, 60);
    query.$or = [
      { action: { $regex: texto, $options: 'i' } },
      { entity: { $regex: texto, $options: 'i' } },
    ];
  }
  return query;
}

/**
 * Listado paginado, lo más reciente primero.
 *
 * Devuelve `before`/`after` **resumidos**: quien recorre la tabla necesita
 * saber qué cambió, no ver dos documentos completos por fila. El contenido
 * entero se pide por id.
 */
export async function listar(filtro: FiltroAuditoria, pagina: campo.Paginacion) {
  const query = construirQuery(filtro);
  const { skip, limit } = campo.saltoYTope(pagina);

  const [documentos, total] = await Promise.all([
    AuditModel.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    AuditModel.countDocuments(query),
  ]);

  const actores = await nombresDeActores(documentos as RegistroPlano[]);

  return {
    items: (documentos as RegistroPlano[]).map(documento => ({
      _id: String(documento._id),
      createdAt: documento.createdAt,
      action: documento.action,
      entity: documento.entity,
      entityId: documento.entityId ? String(documento.entityId) : null,
      actorId: documento.actorId ? String(documento.actorId) : null,
      actorNombre: actores.get(String(documento.actorId)) ?? null,
      ip: documento.ip ?? null,
      /** Qué campos cambiaron, sin el contenido. El detalle se pide por id. */
      camposCambiados: clavesCambiadas(documento),
    })),
    total,
  };
}

/** Detalle de un evento, con el antes y el después ya saneados. */
export async function obtener(id: string) {
  if (!Types.ObjectId.isValid(id)) {
    const error = new Error('Not found') as Error & { statusCode: number };
    error.statusCode = 404;
    throw error;
  }
  const documento = (await AuditModel.findById(id).lean()) as RegistroPlano | null;
  if (!documento) {
    const error = new Error('Not found') as Error & { statusCode: number };
    error.statusCode = 404;
    throw error;
  }

  const actores = await nombresDeActores([documento]);
  return {
    _id: String(documento._id),
    createdAt: documento.createdAt,
    action: documento.action,
    entity: documento.entity,
    entityId: documento.entityId ? String(documento.entityId) : null,
    actorId: documento.actorId ? String(documento.actorId) : null,
    actorNombre: actores.get(String(documento.actorId)) ?? null,
    ip: documento.ip ?? null,
    userAgent: documento.userAgent ?? null,
    // Segunda pasada de saneado: los registros escritos antes de que
    // `shared/sanitize.ts` existiera pueden llevar dentro cualquier cosa.
    before: sanearValor(documento.before),
    after: sanearValor(documento.after),
  };
}

/** Valores distintos de `action` y `entity`, para llenar los desplegables. */
export async function catalogo() {
  const [acciones, entidades] = await Promise.all([
    AuditModel.distinct('action'),
    AuditModel.distinct('entity'),
  ]);
  return {
    acciones: acciones.map(String).filter(Boolean).sort(),
    entidades: entidades.map(String).filter(Boolean).sort(),
  };
}

/**
 * Nombres de los actores en una sola consulta.
 *
 * Sin esto, la tabla haría una consulta por fila para poner un nombre: cien
 * filas, cien viajes. Es el N+1 clásico de un panel administrativo.
 */
async function nombresDeActores(documentos: RegistroPlano[]): Promise<Map<string, string>> {
  const ids = [...new Set(documentos.map(d => d.actorId).filter(Boolean).map(String))];
  if (ids.length === 0) return new Map();

  const usuarios = await UserModel.find({ _id: { $in: ids } })
    .select('fullName email')
    .lean();
  return new Map(
    usuarios.map(usuario => [String(usuario._id), String(usuario.fullName ?? usuario.email ?? '')]),
  );
}

/** Claves que aparecen en `after`, que es lo que el diff ya dejó reducido. */
function clavesCambiadas(documento: RegistroPlano): string[] {
  const after = documento.after;
  if (!after || typeof after !== 'object' || Array.isArray(after)) return [];
  return Object.keys(after as Record<string, unknown>).slice(0, 12);
}
