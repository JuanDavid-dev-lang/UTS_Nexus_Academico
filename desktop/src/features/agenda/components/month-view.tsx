import { useMemo } from 'react';
import { cn } from '@/shared/lib/cn';
import {
  agruparPorFecha,
  diasDeMes,
  esHoy,
  fechaCampus,
  horaCampus,
  partesCampus,
} from '@/domain/agenda/calendar';
import { PRESENTACION_TIPO } from '@/features/agenda/presentacion';
import type { AgendaItem } from '@/domain/schemas/agenda';

const CABECERAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

/** Cuántos items caben en una celda antes de resumir el resto. */
const MAX_VISIBLES = 3;

/**
 * Vista mensual: seis semanas completas.
 *
 * Se pintan siempre 42 días, incluidos los del mes anterior y el siguiente, en
 * un gris más apagado. Dejar esos huecos en blanco escondería clases reales:
 * el lunes 30 de un mes es un día lectivo como cualquier otro.
 */
export function MonthView({
  items,
  ancla,
  offset,
  ahora,
  onSelect,
  onSelectDay,
}: {
  items: AgendaItem[];
  ancla: Date;
  offset: number;
  ahora: Date;
  onSelect: (item: AgendaItem) => void;
  onSelectDay: (fecha: Date) => void;
}) {
  const dias = useMemo(() => diasDeMes(ancla, offset), [ancla, offset]);
  const porFecha = useMemo(() => agruparPorFecha(items), [items]);
  const mesAncla = partesCampus(ancla, offset).mes;

  return (
    <div className="surface-card overflow-hidden">
      <div className="grid grid-cols-7 border-b border-border bg-surface-alt">
        {CABECERAS.map((nombre) => (
          <div key={nombre} className="px-2 py-2 text-center text-caption font-semibold uppercase tracking-wide text-muted">
            {nombre}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {dias.map((dia) => {
          const clave = fechaCampus(dia, offset);
          const delDia = porFecha.get(clave) ?? [];
          const { dia: numero, mes } = partesCampus(dia, offset);
          const fueraDeMes = mes !== mesAncla;
          const hoy = esHoy(dia, offset, ahora);

          return (
            <div
              key={clave}
              className={cn(
                'flex min-h-28 flex-col gap-1 border-b border-l border-border p-1.5',
                fueraDeMes && 'bg-surface-alt/40',
                hoy && 'bg-primary/[0.06]',
              )}
            >
              <button
                type="button"
                onClick={() => onSelectDay(dia)}
                className={cn(
                  'self-start rounded-full px-1.5 text-caption font-semibold transition-colors',
                  hoy ? 'bg-primary text-on-primary' : fueraDeMes ? 'text-muted' : 'text-text',
                  'hover:bg-surface-hover focus:outline-none focus:ring-2 focus:ring-ring/40',
                )}
                aria-label={`Ver el ${clave}`}
              >
                {numero}
              </button>

              {delDia.slice(0, MAX_VISIBLES).map((item) => {
                const presentacion = PRESENTACION_TIPO[item.type];
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onSelect(item)}
                    title={`${horaCampus(item.startAt, offset)} · ${item.title}`}
                    className={cn(
                      'flex w-full items-center gap-1 truncate rounded px-1 py-0.5 text-left text-caption',
                      presentacion.suave,
                      item.status === 'TERMINADA' && 'opacity-60',
                    )}
                  >
                    <span className={cn('size-1.5 shrink-0 rounded-full', presentacion.barra)} aria-hidden />
                    <span className="truncate">{item.title || item.subjectName}</span>
                  </button>
                );
              })}

              {delDia.length > MAX_VISIBLES ? (
                <button
                  type="button"
                  onClick={() => onSelectDay(dia)}
                  className="self-start px-1 text-caption font-medium text-primary hover:underline"
                >
                  +{delDia.length - MAX_VISIBLES} más
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
