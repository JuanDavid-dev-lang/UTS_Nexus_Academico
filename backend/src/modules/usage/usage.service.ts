import { Types, type AnyBulkWriteOperation } from 'mongoose';
import { UsageDayModel } from '../../models/usage-day.model.js';
import { UserModel } from '../../models/user.model.js';
import { InstitutionModel } from '../../models/institution.model.js';
import { env } from '../../shared/env.js';
import { diaDeCampus } from '../../domains/attendance/class-date.js';
import {
  AcumuladorDeUso,
  CLIENTES_DE_USO,
  MINUTOS_POR_FRANJA,
  activosRecientes,
  ordenarRanking,
  rellenarDias,
  sumarDias,
  type ClienteDeUso,
  type EntradaDeUso,
  type EventoDeUso,
  type FilaRanking,
  type FilaRankingBruta,
} from '../../domains/usage/usage.js';

/**
 * Registro y lectura del uso de la aplicación.
 *
 * **Escritura: en memoria y por lotes.** Cada petición con sesión suma a un
 * acumulador (`registrarUso`), y cada `INTERVALO_VOLCADO_MS` se vuelca todo con
 * UN `bulkWrite` de upserts (`$inc`, `$addToSet`, `$min`, `$max`). Un viaje a
 * Atlas por petición habría duplicado las escrituras de toda la API para
 * guardar una estadística; así son, como mucho, tantas operaciones por minuto
 * como personas activas, en una sola ida y vuelta. Lo que se pierde si el
 * proceso muere sin apagarse bien es, como mucho, un minuto de estadística —y
 * el apagado ordenado vuelca antes de salir (`server.ts`).
 *
 * Las operaciones son conmutativas, así que con varias instancias cada una
 * vuelca lo suyo y el resultado es el mismo que con una.
 */

export const INTERVALO_VOLCADO_MS = 60_000;
/** Si el acumulador crece más que esto entre volcados, se vuelca antes. */
const TOPE_ENTRADAS = 5_000;

const acumulador = new AcumuladorDeUso(env.CAMPUS_UTC_OFFSET_MIN);
let temporizador: NodeJS.Timeout | null = null;
let volcando: Promise<void> | null = null;

export function registrarUso(evento: EventoDeUso): void {
  if (!Types.ObjectId.isValid(evento.userId)) return;
  acumulador.registrar(evento);
  if (acumulador.tamano >= TOPE_ENTRADAS) void volcarUso();
}

function operacion(
  e: EntradaDeUso,
  institucion: Types.ObjectId | null,
): AnyBulkWriteOperation {
  const inc: Record<string, number> = { peticiones: e.peticiones };
  for (const c of CLIENTES_DE_USO) if (e.porCliente[c] > 0) inc[`porCliente.${c}`] = e.porCliente[c];
  return {
    updateOne: {
      // `bulkWrite` no castea: el id va como ObjectId o el upsert duplicaría.
      filter: { userId: new Types.ObjectId(e.userId), dia: e.dia },
      update: {
        $inc: inc,
        $addToSet: { franjas: { $each: e.franjas } },
        $min: { primeraActividad: e.primera },
        $max: { ultimaActividad: e.ultima },
        $set: { rol: e.rol, institutionId: institucion },
      },
      upsert: true,
    },
  };
}

/** Vuelca lo acumulado. Nunca lanza: un fallo devuelve las entradas al acumulador. */
export function volcarUso(): Promise<void> {
  if (volcando) return volcando;
  const entradas = acumulador.vaciar();
  if (entradas.length === 0) return Promise.resolve();

  volcando = (async () => {
    try {
      // Una consulta por volcado (no por petición) para la institución: el
      // token no la lleva y es lo que filtra el resumen.
      const ids = [...new Set(entradas.map((e) => e.userId))].map((id) => new Types.ObjectId(id));
      const usuarios = await UserModel.find({ _id: { $in: ids } }).select('institutionId').lean();
      const institucionDe = new Map(
        usuarios.map((u) => [String(u._id), (u.institutionId as Types.ObjectId | null) ?? null]),
      );
      await UsageDayModel.bulkWrite(
        entradas.map((e) => operacion(e, institucionDe.get(e.userId) ?? null)),
        { ordered: false },
      );
    } catch (causa) {
      console.error('[uso] no se pudo volcar el registro de uso; se reintenta en el siguiente:', causa);
      // `ordered: false` aplica lo que puede: si el error trae las operaciones
      // fallidas, solo esas vuelven. Devolverlas todas haría un segundo `$inc`
      // de peticiones ya escritas.
      const fallidas = (causa as { writeErrors?: { index: number }[] }).writeErrors;
      acumulador.devolver(Array.isArray(fallidas) ? fallidas.map((w) => entradas[w.index]).filter((e) => e !== undefined) : entradas);
    } finally {
      volcando = null;
    }
  })();
  return volcando;
}

export function iniciarVolcadoDeUso(): void {
  if (temporizador) return;
  temporizador = setInterval(() => void volcarUso(), INTERVALO_VOLCADO_MS);
  temporizador.unref();
}

export async function detenerVolcadoDeUso(): Promise<void> {
  if (temporizador) clearInterval(temporizador);
  temporizador = null;
  // Si había un volcado en vuelo, `volcarUso()` devuelve ese y no vacía lo
  // registrado después: se espera y se vuelca otra vez.
  if (volcando) await volcando;
  await volcarUso();
}

// ── Lectura ────────────────────────────────────────────────────────────────

export interface FiltroResumen {
  desde: string;
  hasta: string;
  institutionId?: string;
  rol?: string;
}

export interface FilaRankingConNombre extends FilaRanking {
  nombre: string;
  correo: string;
  rol: string;
  institucion: string | null;
}

/** Acepta el slug (`uts`) o el `_id`. Uno desconocido es 404, no una lista vacía. */
async function resolverInstitucion(valor: string): Promise<Types.ObjectId> {
  const or: Record<string, unknown>[] = [{ institutionId: valor }];
  if (Types.ObjectId.isValid(valor)) or.push({ _id: new Types.ObjectId(valor) });
  const inst = await InstitutionModel.findOne({ $or: or }).select('_id').lean();
  if (!inst) {
    const error = new Error('Institución no encontrada.') as Error & { statusCode: number };
    error.statusCode = 404;
    throw error;
  }
  return inst._id as Types.ObjectId;
}

async function filtroBase(filtro: Omit<FiltroResumen, 'desde' | 'hasta'>): Promise<Record<string, unknown>> {
  return {
    ...(filtro.institutionId ? { institutionId: await resolverInstitucion(filtro.institutionId) } : {}),
    ...(filtro.rol ? { rol: filtro.rol } : {}),
  };
}

const porUsuario = {
  $group: {
    _id: '$userId',
    diasActivos: { $sum: 1 },
    franjas: { $sum: { $size: '$franjas' } },
    peticiones: { $sum: '$peticiones' },
    ultimaActividad: { $max: '$ultimaActividad' },
    rol: { $last: '$rol' },
    escritorio: { $max: '$porCliente.escritorio' },
    web: { $max: '$porCliente.web' },
    movil: { $max: '$porCliente.movil' },
  },
};

type FilaUsuario = {
  _id: Types.ObjectId;
  diasActivos: number;
  franjas: number;
  peticiones: number;
  ultimaActividad: Date;
  rol: string;
} & Record<ClienteDeUso, number>;

type TotalesCliente = { _id: null } & Record<string, number>;

async function cargar(filtro: FiltroResumen) {
  const base = await filtroBase(filtro);
  const enRango = { ...base, dia: { $gte: filtro.desde, $lte: filtro.hasta } };
  const hoy = diaDeCampus(new Date(), env.CAMPUS_UTC_OFFSET_MIN);

  // Cuatro agregaciones independientes, en paralelo. Ninguna devuelve más filas
  // que días del rango o personas con actividad: el ranking se ordena aquí.
  const [porDia, usuarios, peticionesCliente, recientes] = await Promise.all([
    UsageDayModel.aggregate<{ _id: string; usuarios: number }>([
      { $match: enRango },
      { $group: { _id: '$dia', usuarios: { $sum: 1 } } },
    ]),
    UsageDayModel.aggregate<FilaUsuario>([{ $match: enRango }, { $sort: { dia: 1 } }, porUsuario]),
    UsageDayModel.aggregate<TotalesCliente>([
      { $match: enRango },
      {
        $group: {
          _id: null,
          escritorio: { $sum: '$porCliente.escritorio' },
          web: { $sum: '$porCliente.web' },
          movil: { $sum: '$porCliente.movil' },
        },
      },
    ]),
    UsageDayModel.aggregate<{ _id: Types.ObjectId; ultimo: string }>([
      { $match: { ...base, dia: { $gte: sumarDias(hoy, -29), $lte: hoy } } },
      { $group: { _id: '$userId', ultimo: { $max: '$dia' } } },
    ]),
  ]);

  return { porDia, usuarios, peticionesCliente: peticionesCliente[0], recientes, hoy };
}

async function conNombres(filas: FilaRanking[], rolDe: Map<string, string>): Promise<FilaRankingConNombre[]> {
  if (filas.length === 0) return [];
  const usuarios = await UserModel.find({ _id: { $in: filas.map((f) => new Types.ObjectId(f.userId)) } })
    .select('fullName email role institutionId')
    .lean();
  const instIds = [...new Set(usuarios.map((u) => u.institutionId).filter(Boolean).map(String))];
  const instituciones = instIds.length
    ? await InstitutionModel.find({ _id: { $in: instIds.map((id) => new Types.ObjectId(id)) } })
        .select('sigla nombre')
        .lean()
    : [];
  const nombreInst = new Map(instituciones.map((i) => [String(i._id), String(i.sigla || i.nombre)]));
  const porId = new Map(usuarios.map((u) => [String(u._id), u]));

  return filas.map((f) => {
    const u = porId.get(f.userId);
    return {
      ...f,
      nombre: u?.fullName ?? 'Cuenta eliminada',
      correo: u?.email ?? '',
      rol: u?.role ?? rolDe.get(f.userId) ?? '',
      institucion: u?.institutionId ? (nombreInst.get(String(u.institutionId)) ?? null) : null,
    };
  });
}

export async function resumenDeUso(filtro: FiltroResumen, pagina: { page: number; limit: number }) {
  const { porDia, usuarios, peticionesCliente, recientes, hoy } = await cargar(filtro);

  const brutas: FilaRankingBruta[] = usuarios.map((u) => ({
    userId: String(u._id),
    diasActivos: u.diasActivos,
    franjas: u.franjas,
    peticiones: u.peticiones,
    ultimaActividad: u.ultimaActividad,
  }));
  const ranking = ordenarRanking(brutas);
  const rolDe = new Map(usuarios.map((u) => [String(u._id), u.rol]));
  const inicio = (pagina.page - 1) * pagina.limit;
  const items = await conNombres(ranking.slice(inicio, inicio + pagina.limit), rolDe);

  const porCliente = CLIENTES_DE_USO.map((cliente) => ({
    cliente,
    usuarios: usuarios.filter((u) => u[cliente] > 0).length,
    peticiones: peticionesCliente?.[cliente] ?? 0,
  }));

  const roles = new Map<string, { usuarios: number; minutos: number; peticiones: number }>();
  for (const u of usuarios) {
    const r = roles.get(u.rol) ?? { usuarios: 0, minutos: 0, peticiones: 0 };
    roles.set(u.rol, {
      usuarios: r.usuarios + 1,
      minutos: r.minutos + u.franjas * MINUTOS_POR_FRANJA,
      peticiones: r.peticiones + u.peticiones,
    });
  }

  return {
    ok: true as const,
    desde: filtro.desde,
    hasta: filtro.hasta,
    hoy,
    recientes: activosRecientes(recientes.map((r) => r.ultimo), hoy),
    totales: {
      usuarios: usuarios.length,
      minutos: usuarios.reduce((s, u) => s + u.franjas * MINUTOS_POR_FRANJA, 0),
      peticiones: usuarios.reduce((s, u) => s + u.peticiones, 0),
    },
    activosPorDia: rellenarDias(
      porDia.map((d) => ({ dia: d._id, usuarios: d.usuarios })),
      filtro.desde,
      filtro.hasta,
    ),
    porCliente,
    porRol: [...roles.entries()]
      .map(([rol, v]) => ({ rol, ...v }))
      .sort((a, b) => b.usuarios - a.usuarios),
    ranking: {
      items,
      total: ranking.length,
      page: pagina.page,
      limit: pagina.limit,
      hasMore: pagina.page * pagina.limit < ranking.length,
    },
  };
}

/**
 * Solo el ranking, con `items` en la raíz (`respuestaPaginada`): lo que pide
 * la tabla paginada del escritorio al desplazarse. No repite las otras tres
 * agregaciones del resumen en cada página.
 */
export async function rankingDeUso(filtro: FiltroResumen, pagina: { page: number; limit: number }) {
  const base = await filtroBase(filtro);
  const usuarios = await UsageDayModel.aggregate<FilaUsuario>([
    { $match: { ...base, dia: { $gte: filtro.desde, $lte: filtro.hasta } } },
    { $sort: { dia: 1 } },
    porUsuario,
  ]);
  const ranking = ordenarRanking(
    usuarios.map((u) => ({
      userId: String(u._id),
      diasActivos: u.diasActivos,
      franjas: u.franjas,
      peticiones: u.peticiones,
      ultimaActividad: u.ultimaActividad,
    })),
  );
  const rolDe = new Map(usuarios.map((u) => [String(u._id), u.rol]));
  const inicio = (pagina.page - 1) * pagina.limit;
  const items = await conNombres(ranking.slice(inicio, inicio + pagina.limit), rolDe);
  return { items, total: ranking.length };
}
