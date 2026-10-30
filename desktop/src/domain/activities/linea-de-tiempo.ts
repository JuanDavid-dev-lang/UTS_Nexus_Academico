/**
 * Cómo se reparten las actividades en la línea de tiempo.
 *
 * El estado (`OPEN` / `LATE` / `CLOSED`) lo decide el servidor y aquí se
 * respeta tal cual: una actividad solo cae en «Vencidas» si el servidor la
 * marcó `LATE`, nunca porque el reloj de este equipo diga que ya pasó. Lo único
 * que se compara con la fecha local es el tramo de las abiertas —hoy, mañana,
 * esta semana—, que es presentación: con la hora mal puesta una entrega puede
 * salir en «Mañana» en vez de «Hoy», pero nunca como vencida si no lo está.
 */
import { fechaCampus } from '@/domain/agenda/calendar';
import type { Actividad } from '@/domain/schemas/activities';

export type TramoActividades = 'VENCIDAS' | 'HOY' | 'MANANA' | 'SEMANA' | 'DESPUES' | 'CERRADAS';

export type GrupoDeActividades = {
  tramo: TramoActividades;
  titulo: string;
  items: Actividad[];
};

const TITULO: Record<TramoActividades, string> = {
  VENCIDAS: 'Vencidas',
  HOY: 'Vencen hoy',
  MANANA: 'Vencen mañana',
  SEMANA: 'Próximos 7 días',
  DESPUES: 'Más adelante',
  CERRADAS: 'Cerradas',
};

const ORDEN: TramoActividades[] = ['VENCIDAS', 'HOY', 'MANANA', 'SEMANA', 'DESPUES', 'CERRADAS'];

const MS_DIA = 86_400_000;

/** Días de calendario del campus entre dos claves 'YYYY-MM-DD'. */
function diasEntre(desde: string, hasta: string): number {
  return Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / MS_DIA);
}

export function tramoDe(actividad: Actividad, ahora: Date, offsetMinutos: number): TramoActividades {
  if (actividad.estado === 'CLOSED') return 'CERRADAS';
  if (actividad.estado === 'LATE') return 'VENCIDAS';

  const dias = diasEntre(fechaCampus(ahora, offsetMinutos), fechaCampus(actividad.dueAt, offsetMinutos));
  // Abierta según el servidor aunque este equipo crea que ya pasó: se queda
  // en «hoy», que es lo más cerca de vencida que el cliente puede afirmar.
  if (dias <= 0) return 'HOY';
  if (dias === 1) return 'MANANA';
  if (dias <= 7) return 'SEMANA';
  return 'DESPUES';
}

function porFecha(a: Actividad, b: Actividad): number {
  return Date.parse(a.dueAt) - Date.parse(b.dueAt);
}

/**
 * Grupos no vacíos, en el orden en que se leen: lo urgente arriba.
 * Dentro de cada grupo, por fecha límite; las cerradas, la más reciente primero.
 */
export function agruparActividades(
  actividades: readonly Actividad[],
  ahora: Date,
  offsetMinutos: number,
): GrupoDeActividades[] {
  const porTramo = new Map<TramoActividades, Actividad[]>();
  for (const actividad of actividades) {
    const tramo = tramoDe(actividad, ahora, offsetMinutos);
    porTramo.set(tramo, [...(porTramo.get(tramo) ?? []), actividad]);
  }

  return ORDEN.filter((tramo) => porTramo.has(tramo)).map((tramo) => {
    const items = [...(porTramo.get(tramo) ?? [])].sort(porFecha);
    return { tramo, titulo: TITULO[tramo], items: tramo === 'CERRADAS' ? items.reverse() : items };
  });
}

/** Cuántas hay de cada estado, para las pestañas del filtro. */
export function contarPorEstado(actividades: readonly Actividad[]): Record<'OPEN' | 'LATE' | 'CLOSED', number> {
  const cuenta = { OPEN: 0, LATE: 0, CLOSED: 0 };
  for (const actividad of actividades) cuenta[actividad.estado] += 1;
  return cuenta;
}
