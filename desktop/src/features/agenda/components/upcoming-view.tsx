import { useMemo } from 'react';
import { Card, EmptyState } from '@/shared/ui';
import { agruparPorFecha, nombreDia, nombreMes, partesCampus } from '@/domain/agenda/calendar';
import { AgendaRow } from '@/features/agenda/components/day-view';
import type { AgendaItem } from '@/domain/schemas/agenda';

/**
 * Próximas actividades: lo que viene, agrupado por día.
 *
 * Descarta lo ya terminado. Una lista de "próximas" que empieza con la clase de
 * las ocho de esta mañana obliga a buscar dónde está el presente.
 */
export function UpcomingView({
  items,
  offset,
  ahora,
  onSelect,
}: {
  items: AgendaItem[];
  offset: number;
  ahora: Date;
  onSelect: (item: AgendaItem) => void;
}) {
  const proximos = useMemo(
    () => items.filter((item) => new Date(item.endAt).getTime() >= ahora.getTime()).slice(0, 60),
    [items, ahora],
  );

  const porFecha = useMemo(() => agruparPorFecha(proximos), [proximos]);

  if (proximos.length === 0) {
    return (
      <Card>
        <EmptyState
          title="Nada pendiente"
          message="No hay clases ni eventos por venir en los próximos 30 días."
        />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {[...porFecha.entries()].map(([fecha, delDia]) => {
        const referencia = new Date(`${fecha}T12:00:00.000Z`);
        const { dia } = partesCampus(referencia, 0);

        return (
          <section key={fecha} className="flex flex-col gap-2">
            <h2 className="text-caption font-bold uppercase tracking-wide text-muted">
              {nombreDia(referencia, 0)} {dia} de {nombreMes(referencia, 0)}
              <span className="ml-2 font-normal normal-case tracking-normal">
                · {delDia.length} {delDia.length === 1 ? 'actividad' : 'actividades'}
              </span>
            </h2>

            <ul className="flex flex-col gap-2">
              {delDia.map((item) => (
                <li key={item.id}>
                  <AgendaRow item={item} offset={offset} onSelect={onSelect} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
