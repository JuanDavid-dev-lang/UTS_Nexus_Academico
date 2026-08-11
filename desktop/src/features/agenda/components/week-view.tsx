import { useMemo } from 'react';
import { cn } from '@/shared/lib/cn';
import {
  agruparPorFecha,
  diasDeSemana,
  distribuirDia,
  esHoy,
  fechaCampus,
  franjaVisible,
  horaCampus,
  minutoDelDia,
  nombreDia,
  partesCampus,
} from '@/domain/agenda/calendar';
import { PRESENTACION_TIPO } from '@/features/agenda/presentacion';
import type { AgendaItem } from '@/domain/schemas/agenda';

/**
 * Vista semanal: la principal en escritorio.
 *
 * Es una rejilla de siete columnas con posición absoluta dentro de cada día. La
 * franja horaria se ajusta a lo que hay (`franjaVisible`): dibujar de 0 a 24
 * para mostrar clases de 7 a 20 deja media pantalla vacía y comprime lo único
 * que se quiere leer.
 */
export function WeekView({
  items,
  ancla,
  offset,
  ahora,
  onSelect,
}: {
  items: AgendaItem[];
  ancla: Date;
  offset: number;
  ahora: Date;
  onSelect: (item: AgendaItem) => void;
}) {
  const dias = useMemo(() => diasDeSemana(ancla, offset), [ancla, offset]);
  const { desdeHora, hastaHora } = useMemo(() => franjaVisible(items, offset), [items, offset]);
  const porFecha = useMemo(() => agruparPorFecha(items), [items]);

  const horas = useMemo(
    () => Array.from({ length: hastaHora - desdeHora }, (_, indice) => desdeHora + indice),
    [desdeHora, hastaHora],
  );

  // Línea de "ahora": solo se dibuja si el día actual está en la semana vista.
  const minutoAhora = minutoDelDia(ahora, offset);
  const dentroDeFranja = minutoAhora >= desdeHora * 60 && minutoAhora < hastaHora * 60;
  const topAhora = ((minutoAhora - desdeHora * 60) / ((hastaHora - desdeHora) * 60)) * 100;

  return (
    <div className="surface-card overflow-hidden">
      {/* Cabecera de días. Se queda fija al desplazar la rejilla. */}
      <div className="sticky top-0 z-10 grid grid-cols-[3.5rem_repeat(7,minmax(0,1fr))] border-b border-border bg-surface">
        <div />
        {dias.map((dia) => {
          const hoy = esHoy(dia, offset, ahora);
          const { dia: numero } = partesCampus(dia, offset);
          return (
            <div
              key={fechaCampus(dia, offset)}
              className={cn('flex flex-col items-center gap-0.5 border-l border-border px-1 py-2', hoy && 'bg-primary/5')}
            >
              <span className="text-caption uppercase tracking-wide text-muted">
                {nombreDia(dia, offset).slice(0, 3)}
              </span>
              <span
                className={cn(
                  'grid size-7 place-items-center rounded-full text-body font-semibold',
                  hoy ? 'bg-primary text-on-primary' : 'text-text',
                )}
              >
                {numero}
              </span>
            </div>
          );
        })}
      </div>

      <div className="scrollbar-slim relative max-h-[calc(100dvh-22rem)] overflow-y-auto">
        <div
          className="grid grid-cols-[3.5rem_repeat(7,minmax(0,1fr))]"
          style={{ height: `${Math.max(480, horas.length * 56)}px` }}
        >
          {/* Columna de horas */}
          <div className="relative border-r border-border">
            {horas.map((hora, indice) => (
              <span
                key={hora}
                className="absolute right-1.5 -translate-y-1/2 text-caption text-muted"
                style={{ top: `${(indice / horas.length) * 100}%` }}
              >
                {hora === 0 ? '12 am' : hora < 12 ? `${hora} am` : hora === 12 ? '12 pm' : `${hora - 12} pm`}
              </span>
            ))}
          </div>

          {dias.map((dia) => {
            const clave = fechaCampus(dia, offset);
            const delDia = porFecha.get(clave) ?? [];
            const bloques = distribuirDia(delDia, offset, desdeHora, hastaHora);
            const hoy = esHoy(dia, offset, ahora);

            return (
              <div key={clave} className={cn('relative border-l border-border', hoy && 'bg-primary/[0.03]')}>
                {/* Líneas de hora, puramente visuales. */}
                {horas.map((hora, indice) => (
                  <div
                    key={hora}
                    className="absolute inset-x-0 border-t border-border/60"
                    style={{ top: `${(indice / horas.length) * 100}%` }}
                    aria-hidden
                  />
                ))}

                {hoy && dentroDeFranja ? (
                  <div
                    className="absolute inset-x-0 z-20 border-t-2 border-danger"
                    style={{ top: `${topAhora}%` }}
                    aria-hidden
                  >
                    <span className="absolute -left-1 -top-1 size-2 rounded-full bg-danger" />
                  </div>
                ) : null}

                {bloques.map(({ item, top, alto, columna, columnas }) => {
                  const presentacion = PRESENTACION_TIPO[item.type];
                  const ancho = 100 / columnas;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onSelect(item)}
                      title={`${item.title} · ${horaCampus(item.startAt, offset)}`}
                      className={cn(
                        'absolute overflow-hidden rounded-md border border-border/60 px-1.5 py-1 text-left',
                        'transition-shadow hover:shadow-pop focus:outline-none focus:ring-2 focus:ring-ring/40',
                        presentacion.suave,
                        item.status === 'TERMINADA' && 'opacity-60',
                      )}
                      style={{
                        top: `${top}%`,
                        height: `${alto}%`,
                        left: `calc(${columna * ancho}% + 2px)`,
                        width: `calc(${ancho}% - 4px)`,
                      }}
                    >
                      <span className={cn('absolute inset-y-0 left-0 w-0.5', presentacion.barra)} aria-hidden />
                      <span className="block truncate pl-1 text-caption font-semibold">
                        {item.title || item.subjectName}
                      </span>
                      <span className="block truncate pl-1 text-caption opacity-80">
                        {horaCampus(item.startAt, offset)}
                        {item.classroom ? ` · ${item.classroom}` : ''}
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
