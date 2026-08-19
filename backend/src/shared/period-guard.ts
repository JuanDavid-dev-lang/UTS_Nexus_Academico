/**
 * Guardia de escritura por estado del periodo.
 *
 * Se llama desde cada ruta que escribe algo académico. Es una consulta por
 * petición, así que va con una caché de pocos segundos: el estado de un
 * periodo cambia como mucho una vez por semestre, y sin caché una importación
 * de 500 notas haría 500 consultas idénticas para preguntar lo mismo.
 *
 * La caché es corta a propósito. Con un cierre en marcha, una ventana de diez
 * segundos deja pasar como mucho unos pocos segundos de escrituras tardías, y
 * el cierre las recoge igual porque la fotografía se genera después de marcar
 * `CLOSING`. Una caché larga sí sería un agujero: el docente seguiría
 * guardando notas minutos después de que se congelara el acta.
 */
import { AcademicPeriodModel } from '../models/academic-period.model.js';
import {
  mensajeDeBloqueo,
  puedeEscribir,
  type EstadoPeriodo,
} from '../domains/periods/period-lifecycle.js';

const TTL_MS = 10_000;

type Entrada = { estado: EstadoPeriodo | null; expira: number };
const cache = new Map<string, Entrada>();

/** Invalida la caché. La llama el servicio de periodos al cambiar un estado. */
export function invalidarCachePeriodos(periodo?: string): void {
  if (periodo) cache.delete(periodo);
  else cache.clear();
}

/**
 * Estado de un periodo, o `null` si no está registrado.
 *
 * `null` no es un error: la institución lleva semestres sin este registro, y
 * tratar la ausencia como «cerrado» dejaría la aplicación entera en solo
 * lectura el día del despliegue.
 */
export async function estadoDePeriodo(periodo: string): Promise<EstadoPeriodo | null> {
  if (!periodo) return null;

  const ahora = Date.now();
  const guardado = cache.get(periodo);
  if (guardado && guardado.expira > ahora) return guardado.estado;

  const documento = await AcademicPeriodModel.findOne({ period: periodo })
    .select('state')
    .lean<{ state?: EstadoPeriodo } | null>();

  const estado = (documento?.state as EstadoPeriodo | undefined) ?? null;
  cache.set(periodo, { estado, expira: ahora + TTL_MS });
  return estado;
}

/** Error con `statusCode`, para que `error.ts` lo traduzca a 409 y no a 500. */
export class PeriodoBloqueadoError extends Error {
  statusCode = 409;
  constructor(
    public readonly periodo: string,
    public readonly estado: EstadoPeriodo,
  ) {
    super(mensajeDeBloqueo(periodo, estado));
    this.name = 'PeriodoBloqueadoError';
  }
}

/**
 * Lanza 409 si el periodo no admite escrituras de esa entidad.
 *
 * `entidad` usa los mismos nombres que `sync:update` (`grade`, `attendance`,
 * `enrollment`) para que la lista de lo bloqueado se lea igual en los dos
 * sitios y no haya que traducir entre dos vocabularios.
 */
export async function exigirPeriodoAbierto(periodo: string, entidad: string): Promise<void> {
  const estado = await estadoDePeriodo(periodo);
  if (puedeEscribir(estado, entidad)) return;
  throw new PeriodoBloqueadoError(periodo, estado as EstadoPeriodo);
}

/**
 * Igual que la anterior, para un lote que puede tocar varios periodos.
 *
 * Comprueba cada periodo distinto una sola vez: un lote de 500 notas del mismo
 * semestre no puede costar 500 comprobaciones.
 */
export async function exigirPeriodosAbiertos(periodos: string[], entidad: string): Promise<void> {
  for (const periodo of [...new Set(periodos.filter(Boolean))]) {
    await exigirPeriodoAbierto(periodo, entidad);
  }
}
