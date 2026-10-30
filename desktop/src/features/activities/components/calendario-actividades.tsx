import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/shared/ui';
import { cn } from '@/shared/lib/cn';
import {
  agruparPorFecha,
  diasDeMes,
  esHoy,
  fechaCampus,
  horaCampus,
  navegar,
  nombreDia,
  nombreMes,
  partesCampus,
} from '@/domain/agenda/calendar';
import { useAgendaRange } from '@/features/agenda/hooks/use-agenda';
import { PRESENTACION_TIPO } from '@/features/agenda/presentacion';
import type { Actividad } from '@/domain/schemas/activities';

const CABECERAS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

type Props = {
  actividades: readonly Actividad[];
  subjectId: string;
  offset: number;
  ahora: Date;
  nombreDeMateria: (id: string) => string;
  onElegirActividad: (id: string) => void;
};

/**
 * El mes de un vistazo, junto a la lista: qué días hay entregas y qué más
 * trae la agenda ese día (clases, parciales, reuniones).
 *
 * Las clases y los eventos salen de la misma consulta que usa la pantalla de
 * Agenda (`useAgendaRange`), así que lo que se ve aquí y allí no puede
 * diferir. Las entregas se toman de la lista de actividades y no de la agenda
 * para no contarlas dos veces.
 */
export function CalendarioActividades({ actividades, subjectId, offset, ahora, nombreDeMateria, onElegirActividad }: Props) {
  const navigate = useNavigate();
  const [ancla, setAncla] = useState(() => new Date());
  const [elegido, setElegido] = useState(() => fechaCampus(new Date(), offset));

  const agenda = useAgendaRange('mes', ancla, subjectId ? { subjectId } : {});
  const dias = useMemo(() => diasDeMes(ancla, offset), [ancla, offset]);
  const mesAncla = partesCampus(ancla, offset).mes;

  const entregasPorDia = useMemo(() => {
    const mapa = new Map<string, Actividad[]>();
    for (const actividad of actividades) {
      const clave = fechaCampus(actividad.dueAt, offset);
      mapa.set(clave, [...(mapa.get(clave) ?? []), actividad]);
    }
    return mapa;
  }, [actividades, offset]);

  const agendaPorDia = useMemo(
    () => agruparPorFecha((agenda.data?.items ?? []).filter((item) => item.origen !== 'activity')),
    [agenda.data],
  );

  const entregasDelDia = entregasPorDia.get(elegido) ?? [];
  const agendaDelDia = agendaPorDia.get(elegido) ?? [];
  const fechaElegida = new Date(`${elegido}T12:00:00Z`);
  const tituloDia = `${nombreDia(fechaElegida, 0)} ${partesCampus(fechaElegida, 0).dia} de ${nombreMes(fechaElegida, 0)}`;

  return (
    <aside className="surface-card flex flex-col" aria-label="Calendario de entregas">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <h2 className="text-body font-semibold text-text first-letter:uppercase">
          {nombreMes(ancla, offset)} {partesCampus(ancla, offset).anio}
        </h2>
        <div className="flex items-center">
          <Button variant="ghost" size="icon-sm" aria-label="Mes anterior" onClick={() => setAncla((actual) => navegar('mes', actual, -1, offset))}>
            <ChevronLeft aria-hidden />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Mes siguiente" onClick={() => setAncla((actual) => navegar('mes', actual, 1, offset))}>
            <ChevronRight aria-hidden />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-0.5 p-2 text-center">
        {CABECERAS.map((nombre, indice) => (
          <span key={indice} className="py-1 text-caption text-subtle">
            {nombre}
          </span>
        ))}
        {dias.map((dia) => {
          const clave = fechaCampus(dia, offset);
          const { dia: numero, mes } = partesCampus(dia, offset);
          const entregas = entregasPorDia.get(clave) ?? [];
          const eventos = (agendaPorDia.get(clave) ?? []).filter((item) => item.kind !== 'CLASS');
          const hayVencida = entregas.some((actividad) => actividad.estado === 'LATE');
          const hoy = esHoy(dia, offset, ahora);
          const seleccionado = clave === elegido;

          return (
            <button
              key={clave}
              type="button"
              onClick={() => setElegido(clave)}
              aria-pressed={seleccionado}
              aria-label={`${clave}${entregas.length ? `, ${entregas.length} entrega${entregas.length === 1 ? '' : 's'}` : ''}`}
              className={cn(
                'flex h-10 flex-col items-center justify-center gap-0.5 rounded-md text-caption transition-colors',
                'hover:bg-surface-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
                mes !== mesAncla && 'text-subtle',
                hoy && !seleccionado && 'font-semibold text-primary',
                seleccionado && 'bg-primary text-on-primary hover:bg-primary',
              )}
            >
              <span className="tabular">{numero}</span>
              <span className="flex h-1.5 items-center gap-0.5" aria-hidden>
                {entregas.length > 0 ? (
                  <span className={cn('size-1.5 rounded-full', seleccionado ? 'bg-on-primary' : hayVencida ? 'bg-warning' : 'bg-info')} />
                ) : null}
                {eventos.length > 0 ? (
                  <span className={cn('size-1.5 rounded-full', seleccionado ? 'bg-on-primary/70' : 'bg-danger')} />
                ) : null}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1 px-3 pb-2 text-caption text-muted">
        <span className="inline-flex items-center gap-1">
          <span className="size-1.5 rounded-full bg-info" aria-hidden /> entrega
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="size-1.5 rounded-full bg-warning" aria-hidden /> vencida
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="size-1.5 rounded-full bg-danger" aria-hidden /> evento o parcial
        </span>
      </div>

      {/* Lo que hay el día elegido: las entregas y lo demás de la agenda. */}
      <div className="flex flex-col gap-2 border-t border-border p-3">
        <h3 className="text-body font-semibold text-text first-letter:uppercase">{tituloDia}</h3>

        {entregasDelDia.length === 0 && agendaDelDia.length === 0 ? (
          <p className="text-caption text-muted">Nada programado este día.</p>
        ) : null}

        <ul className="flex flex-col gap-1">
          {entregasDelDia.map((actividad) => (
            <li key={actividad._id}>
              <button
                type="button"
                onClick={() => onElegirActividad(actividad._id)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-surface-hover"
              >
                <span className={cn('h-8 w-1 shrink-0 rounded-full', actividad.estado === 'LATE' ? 'bg-warning' : 'bg-info')} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body text-text">{actividad.title}</span>
                  <span className="block truncate text-caption text-muted">
                    Entrega · {horaCampus(actividad.dueAt, offset)} · {nombreDeMateria(actividad.subjectId)}
                  </span>
                </span>
              </button>
            </li>
          ))}
          {agendaDelDia.map((item) => {
            const presentacion = PRESENTACION_TIPO[item.type];
            return (
              <li key={item.id} className="flex items-center gap-2 px-2 py-1.5">
                <span className={cn('h-8 w-1 shrink-0 rounded-full', presentacion.barra)} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body text-text">{item.title || item.subjectName}</span>
                  <span className="block truncate text-caption text-muted">
                    {presentacion.etiqueta} · {item.allDay ? 'todo el día' : horaCampus(item.startAt, offset)}
                    {item.classroom ? ` · ${item.classroom}` : ''}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>

        <Button variant="secondary" size="sm" className="self-start" onClick={() => navigate('/agenda')}>
          <CalendarDays aria-hidden />
          Abrir la agenda
        </Button>
      </div>
    </aside>
  );
}
