import { MapPin, Users } from 'lucide-react';
import { Card, EmptyState } from '@/shared/ui';
import { cn } from '@/shared/lib/cn';
import { horaCampus } from '@/domain/agenda/calendar';
import { PRESENTACION_TIPO } from '@/features/agenda/presentacion';
import type { AgendaItem } from '@/domain/schemas/agenda';

/**
 * Vista diaria: la lista de lo que toca, en orden.
 *
 * A diferencia de la semanal no usa rejilla: en un solo día no hay nada que
 * comparar en vertical, y una lista deja sitio para el aula, el grupo y la
 * descripción sin recortarlos.
 */
export function DayView({
  items,
  offset,
  onSelect,
}: {
  items: AgendaItem[];
  offset: number;
  onSelect: (item: AgendaItem) => void;
}) {
  if (items.length === 0) {
    return (
      <Card>
        <EmptyState title="Día libre" message="No hay clases ni eventos programados para este día." />
      </Card>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => (
        <li key={item.id}>
          <AgendaRow item={item} offset={offset} onSelect={onSelect} />
        </li>
      ))}
    </ul>
  );
}

export function AgendaRow({
  item,
  offset,
  onSelect,
  mostrarFecha = false,
}: {
  item: AgendaItem;
  offset: number;
  onSelect: (item: AgendaItem) => void;
  mostrarFecha?: boolean;
}) {
  const presentacion = PRESENTACION_TIPO[item.type];

  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      className={cn(
        'surface-card flex w-full items-start gap-3 p-4 text-left transition-colors',
        'hover:bg-surface-alt focus:outline-none focus:ring-2 focus:ring-ring/40',
        item.status === 'EN_CURSO' && 'border-danger/40 bg-danger-soft/30',
        item.status === 'TERMINADA' && 'opacity-70',
      )}
    >
      <span className={cn('grid size-9 shrink-0 place-items-center rounded-xl', presentacion.suave)}>
        <presentacion.icono className="size-4" aria-hidden />
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-body font-semibold text-text">{item.title || item.subjectName}</h3>
          <span className={cn('rounded-full px-2 py-0.5 text-caption font-semibold', presentacion.suave)}>
            {presentacion.etiqueta}
          </span>
          {item.status === 'EN_CURSO' ? (
            <span className="rounded-full bg-danger px-2 py-0.5 text-caption font-bold text-white">
              En curso
            </span>
          ) : null}
        </div>

        <p className="text-body text-muted">
          {mostrarFecha ? `${item.date} · ` : ''}
          {item.allDay
            ? 'Todo el día'
            : `${horaCampus(item.startAt, offset)}${
                item.durationMinutes > 0 ? ` – ${horaCampus(item.endAt, offset)}` : ''
              }`}
          {item.durationMinutes > 0 ? ` · ${item.durationMinutes} min` : ''}
        </p>

        {item.description ? (
          <p className="line-clamp-2 text-caption text-muted" data-selectable>
            {item.description}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-muted">
          {item.subjectName && item.title !== item.subjectName ? <span>{item.subjectName}</span> : null}
          {item.groupName ? (
            <span className="flex items-center gap-1">
              <Users className="size-3.5" aria-hidden />
              Grupo {item.groupName}
            </span>
          ) : null}
          {item.classroom ? (
            <span className="flex items-center gap-1">
              <MapPin className="size-3.5" aria-hidden />
              Aula {item.classroom}
            </span>
          ) : null}
          {item.teacherName ? <span>{item.teacherName}</span> : null}
        </div>
      </div>
    </button>
  );
}
