/**
 * Telemetría de errores de los clientes: orquestación y acceso a datos.
 *
 * Propia y limitada, sin proveedor externo. No es una decisión ideológica: lo
 * que se reporta son fallos ocurridos sobre expedientes de estudiantes reales,
 * con sus cédulas y sus notas dentro de los mensajes, y mandar eso a un
 * tercero convierte un panel de diagnóstico en una transferencia de datos
 * personales que nadie autorizó. Se guarda aquí, saneado, y se borra solo.
 *
 * Dos garantías que se implementan en este archivo y no en los clientes:
 *
 *  - **La firma la calcula el servidor.** Si la calculara el cliente, dos
 *    versiones de la app agruparían distinto el mismo defecto y el panel
 *    mostraría el mismo fallo tres veces.
 *  - **El usuario sale de la sesión.** Un cliente que declarara su propio
 *    `userId` podría declarar el de otro.
 */
import { createHash } from 'node:crypto';
import { ClientErrorModel } from '../../models/client-error.model.js';
import { emitSync } from '../../shared/socket.js';
import { env } from '../../shared/env.js';
import { LIMITES, sanearTexto } from '../../shared/sanitize.js';
import * as campo from '../../shared/validation.js';

export type Cliente = 'desktop' | 'mobile';
export type Categoria = 'render' | 'network' | 'runtime' | 'unhandled' | 'promise' | 'otro';

export type ReporteEntrante = {
  client: Cliente;
  appVersion?: string;
  platform?: string;
  route?: string;
  category?: Categoria;
  message: string;
  context?: string;
};

/**
 * Normaliza un mensaje para agrupar.
 *
 * Sin esto, «Fallo al cargar el estudiante 1098765432» y el mismo fallo con
 * otra cédula serían dos defectos distintos, y el panel tendría cuatrocientas
 * entradas de un solo problema. Los números, los identificadores y las comillas
 * se sustituyen por marcadores: lo que queda es la forma del error.
 */
export function normalizarMensaje(mensaje: string): string {
  return mensaje
    .toLowerCase()
    .replace(/\b[0-9a-f]{24}\b/g, '<id>')
    .replace(/\b[0-9a-f-]{36}\b/g, '<uuid>')
    .replace(/\d+/g, '<n>')
    .replace(/["'`][^"'`]{0,80}["'`]/g, '<txt>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

/**
 * Ruta sin partes identificables.
 *
 * `/estudiantes/64f…/historial` y `/estudiantes/650…/historial` son la misma
 * pantalla; conservarlas distintas rompería la agrupación y, de paso, dejaría
 * el id de un estudiante escrito en la telemetría.
 */
export function normalizarRuta(ruta: string): string {
  return ruta
    .split('?')[0]
    .replace(/\/[0-9a-f]{24}(?=\/|$)/gi, '/:id')
    .replace(/\/\d+(?=\/|$)/g, '/:n')
    .slice(0, 120);
}

/** Firma estable de un defecto. Cambiarla parte el histórico en dos: no tocar. */
export function calcularFirma(entrada: {
  client: string;
  category: string;
  route: string;
  message: string;
}): string {
  const semilla = [
    entrada.client,
    entrada.category,
    normalizarRuta(entrada.route),
    normalizarMensaje(entrada.message),
  ].join('|');
  return createHash('sha256').update(semilla).digest('hex').slice(0, 32);
}

/**
 * Registra un reporte.
 *
 * **No inserta un documento por ocurrencia.** Una pantalla que falla en bucle
 * manda el mismo error cincuenta veces por minuto; guardarlos todos llenaría
 * la colección de ruido y escondería los otros defectos que sí hay. El upsert
 * por firma incrementa el contador y mueve `lastSeenAt`.
 */
export async function registrarError(
  entrada: ReporteEntrante,
  usuario: { id: string },
): Promise<{ signature: string; occurrences: number; nuevo: boolean }> {
  const category = entrada.category ?? 'runtime';
  const route = normalizarRuta(entrada.route ?? '');

  // El saneado va antes de la firma: si el mensaje llevara un token, la firma
  // se calcularía sobre él y el token quedaría implícito en el agrupamiento.
  const message = sanearTexto(entrada.message, LIMITES.MENSAJE);
  const context = entrada.context ? sanearTexto(entrada.context, LIMITES.CONTEXTO) : '';

  const signature = calcularFirma({ client: entrada.client, category, route, message });
  const ahora = new Date();

  const previo = await ClientErrorModel.findOne({ signature }).select('_id lastUserId').lean();

  const documento = await ClientErrorModel.findOneAndUpdate(
    { signature },
    {
      $set: {
        client: entrada.client,
        appVersion: sanearTexto(entrada.appVersion ?? '', 40),
        platform: sanearTexto(entrada.platform ?? '', 40),
        route,
        category,
        message,
        context,
        lastSeenAt: ahora,
        lastUserId: usuario.id,
      },
      $inc: {
        occurrences: 1,
        // Aproximación deliberada: contar personas distintas de verdad exigiría
        // guardar la lista de quién lo sufrió, que es justo lo que no se quiere
        // guardar. Basta con distinguir «le pasa a uno» de «le pasa a muchos».
        affectedUsers: previo && String(previo.lastUserId) !== usuario.id ? 1 : 0,
      },
      $setOnInsert: { signature, firstSeenAt: ahora, status: 'ABIERTO' },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  // Solo se avisa al panel cuando aparece un defecto nuevo: un error en bucle
  // no debe convertirse en un bucle de invalidaciones de caché.
  if (!previo) {
    emitSync('sync:update', { entity: 'clientError', action: 'create', id: String(documento._id) });
  }

  return {
    signature,
    occurrences: Number(documento.occurrences ?? 1),
    nuevo: !previo,
  };
}

export type FiltroErrores = {
  client?: Cliente;
  category?: Categoria;
  status?: 'ABIERTO' | 'RESUELTO' | 'IGNORADO';
  appVersion?: string;
  q?: string;
};

export async function listar(filtro: FiltroErrores, pagina: campo.Paginacion) {
  const query: Record<string, unknown> = {};
  if (filtro.client) query.client = filtro.client;
  if (filtro.category) query.category = filtro.category;
  if (filtro.status) query.status = filtro.status;
  if (filtro.appVersion) query.appVersion = filtro.appVersion;
  if (filtro.q) query.message = { $regex: filtro.q.slice(0, 60), $options: 'i' };

  const { skip, limit } = campo.saltoYTope(pagina);
  const [items, total] = await Promise.all([
    ClientErrorModel.find(query)
      .sort({ occurrences: -1, lastSeenAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    ClientErrorModel.countDocuments(query),
  ]);
  return { items, total };
}

export async function cambiarEstado(
  id: string,
  estado: 'ABIERTO' | 'RESUELTO' | 'IGNORADO',
  actorId: string,
) {
  const documento = await ClientErrorModel.findByIdAndUpdate(
    id,
    {
      $set: {
        status: estado,
        resolvedAt: estado === 'RESUELTO' ? new Date() : null,
        resolvedBy: estado === 'RESUELTO' ? actorId : null,
      },
    },
    { new: true },
  );
  if (!documento) {
    const error = new Error('Not found') as Error & { statusCode: number };
    error.statusCode = 404;
    throw error;
  }
  emitSync('sync:update', { entity: 'clientError', action: 'update', id: String(documento._id) });
  return documento.toObject();
}

export async function eliminar(id: string): Promise<void> {
  await ClientErrorModel.deleteOne({ _id: id });
  emitSync('sync:update', { entity: 'clientError', action: 'delete', id });
}

/**
 * Purga de lo resuelto y antiguo.
 *
 * La telemetría es diagnóstico, no archivo: un defecto arreglado hace medio
 * año no ayuda a nadie y sí engorda la colección. Con
 * `TELEMETRY_RETENTION_DAYS=0` no se borra nada.
 */
export async function purgar(): Promise<number> {
  const dias = env.TELEMETRY_RETENTION_DAYS;
  if (!dias || dias <= 0) return 0;
  const corte = new Date(Date.now() - dias * 86_400_000);
  const resultado = await ClientErrorModel.deleteMany({
    status: { $in: ['RESUELTO', 'IGNORADO'] },
    lastSeenAt: { $lt: corte },
  });
  return resultado.deletedCount ?? 0;
}

/** Resumen para el centro de salud: cuántos defectos abiertos y de qué tipo. */
export async function resumen() {
  const [abiertos, porCliente, masFrecuentes] = await Promise.all([
    ClientErrorModel.countDocuments({ status: 'ABIERTO' }),
    ClientErrorModel.aggregate<{ _id: string; total: number }>([
      { $match: { status: 'ABIERTO' } },
      { $group: { _id: '$client', total: { $sum: '$occurrences' } } },
    ]),
    ClientErrorModel.find({ status: 'ABIERTO' })
      .sort({ occurrences: -1 })
      .limit(5)
      .select('message client appVersion occurrences lastSeenAt category')
      .lean(),
  ]);

  return {
    abiertos,
    porCliente: Object.fromEntries(porCliente.map(fila => [String(fila._id), fila.total])),
    masFrecuentes,
  };
}
