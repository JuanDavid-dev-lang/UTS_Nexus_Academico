import { CalendarClock, DoorOpen, MapPin, Users } from 'lucide-react';
import { Badge, Button, Dialog, DialogContent, DialogFooter } from '@/shared/ui';
import { cn } from '@/shared/lib/cn';
import { horaCampus } from '@/domain/agenda/calendar';
import { ETIQUETA_PRIORIDAD, PRESENTACION_TIPO } from '@/features/agenda/presentacion';
import type { AgendaItem } from '@/domain/schemas/agenda';

/**
 * Detalle de un elemento de la agenda.
 *
 * Es de lectura salvo para los eventos propios: una clase viene del horario y
 * una entrega de `/activities`, y ofrecer aquí un botón de editar que abre otra
 * pantalla distinta según el caso confundiría más de lo que ayuda. Se dice de
 * dónde sale y ya.
 */
export function ItemDialog({
  item,
  offset,
  onOpenChange,
  onEditar,
}: {
  item: AgendaItem | null;
  offset: number;
  onOpenChange: (open: boolean) => void;
  onEditar: (item: AgendaItem) => void;
}) {
  if (!item) return null;

  const presentacion = PRESENTACION_TIPO[item.type];
  const esEventoPropio = item.origen === 'event' && item.editable;

  return (
    <Dialog open={Boolean(item)} onOpenChange={onOpenChange}>
      <DialogContent title={item.title || item.subjectName || 'Detalle'} description={presentacion.etiqueta}>
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn('flex items-center gap-1.5 rounded-full px-2.5 py-1 text-caption font-semibold', presentacion.suave)}>
              <presentacion.icono className="size-3.5" aria-hidden />
              {presentacion.etiqueta}
            </span>
            {item.status === 'EN_CURSO' ? <Badge tone="danger">En curso</Badge> : null}
            {item.status === 'TERMINADA' ? <Badge>Finalizada</Badge> : null}
            {item.kind !== 'CLASS' ? <Badge>Prioridad {ETIQUETA_PRIORIDAD[item.priority]}</Badge> : null}
          </div>

          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-body">
            <dt className="flex items-center gap-1.5 text-muted">
              <CalendarClock className="size-4" aria-hidden />
              Cuándo
            </dt>
            <dd className="text-text">
              {item.date}
              {item.allDay
                ? ' · todo el día'
                : ` · ${horaCampus(item.startAt, offset)}${
                    item.durationMinutes > 0 ? ` – ${horaCampus(item.endAt, offset)}` : ''
                  }`}
              {item.durationMinutes > 0 ? ` (${item.durationMinutes} min)` : ''}
            </dd>

            {item.subjectName ? (
              <>
                <dt className="text-muted">Materia</dt>
                <dd className="text-text">
                  {item.subjectName}
                  {item.subjectCode ? ` (${item.subjectCode})` : ''}
                </dd>
              </>
            ) : null}

            {item.groupName ? (
              <>
                <dt className="flex items-center gap-1.5 text-muted">
                  <Users className="size-4" aria-hidden />
                  Grupo
                </dt>
                <dd className="text-text">{item.groupName}</dd>
              </>
            ) : null}

            {item.classroom ? (
              <>
                <dt className="flex items-center gap-1.5 text-muted">
                  <MapPin className="size-4" aria-hidden />
                  Aula
                </dt>
                <dd className="text-text">{item.classroom}</dd>
              </>
            ) : null}

            {item.teacherName ? (
              <>
                <dt className="flex items-center gap-1.5 text-muted">
                  <DoorOpen className="size-4" aria-hidden />
                  Docente
                </dt>
                <dd className="text-text">{item.teacherName}</dd>
              </>
            ) : null}

            {item.period ? (
              <>
                <dt className="text-muted">Periodo</dt>
                <dd className="text-text">{item.period}</dd>
              </>
            ) : null}
          </dl>

          {item.description ? (
            <p className="whitespace-pre-line rounded-lg bg-surface-alt p-3 text-body text-text" data-selectable>
              {item.description}
            </p>
          ) : null}

          {item.reminderMinutes.length > 0 ? (
            <p className="text-caption text-muted">
              Recordatorios: {item.reminderMinutes.map((minutos) => `${minutos} min antes`).join(', ')}.
            </p>
          ) : null}

          {item.origen === 'schedule' ? (
            <p className="text-caption text-muted">
              Esta clase viene de tu horario semanal. Para cambiar la hora o el aula, edítala en el horario:
              el cambio se aplica a todas las semanas.
            </p>
          ) : null}

          {item.origen === 'activity' ? (
            <p className="text-caption text-muted">
              Esta entrega se administra desde las actividades de la materia.
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
          {esEventoPropio ? (
            <Button variant="primary" onClick={() => onEditar(item)}>
              Editar evento
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
