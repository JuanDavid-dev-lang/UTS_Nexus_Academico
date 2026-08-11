import { CalendarOff, DoorOpen, MapPin, Radio, Timer, Users } from 'lucide-react';
import { Card, Skeleton } from '@/shared/ui';
import { cn } from '@/shared/lib/cn';
import { horaCampus, tiempoRestante } from '@/domain/agenda/calendar';
import { minutosHasta, useAgendaResumen, useAhora } from '@/features/agenda/hooks/use-agenda';
import type { AgendaItem } from '@/domain/schemas/agenda';

/**
 * Clase en curso y próxima clase.
 *
 * El contador se recalcula con el reloj local a partir de la hora que dio el
 * servidor: el minuto que falta no vale una petición, pero la hora de la clase
 * no puede salir del cliente. Si el equipo tiene la hora mal, el contador se
 * desviará —y eso es visible—, pero la hora de la clase seguirá siendo la real.
 */
export function NextClassCard({ compacto = false }: { compacto?: boolean }) {
  const resumen = useAgendaResumen();
  const ahora = useAhora(30_000);

  if (resumen.isPending) {
    return (
      <Card className="p-5">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="mt-3 h-8 w-64" />
        <Skeleton className="mt-2 h-4 w-48" />
      </Card>
    );
  }

  if (resumen.isError) {
    // Un fallo aquí no debe tapar el calendario, que es lo importante de la
    // pantalla: se dice qué pasó en una línea y se sigue.
    return (
      <Card className="flex items-center gap-3 p-5 text-body text-muted">
        <CalendarOff className="size-4 shrink-0" aria-hidden />
        No se pudo consultar tu próxima clase.
      </Card>
    );
  }

  const enCurso = resumen.data?.enCurso ?? null;
  const proxima = resumen.data?.proxima ?? null;
  const offset = resumen.data?.campusOffsetMinutes ?? -300;

  if (!enCurso && !proxima) {
    return (
      <Card className="flex items-center gap-3 p-5 text-body text-muted">
        <CalendarOff className="size-4 shrink-0" aria-hidden />
        No tienes clases programadas en los próximos días.
      </Card>
    );
  }

  return (
    <div className={cn('grid gap-3', enCurso && proxima && !compacto ? 'md:grid-cols-2' : 'grid-cols-1')}>
      {enCurso ? (
        <BloqueDestacado
          item={enCurso}
          offset={offset}
          tono="curso"
          rotulo="Clase en curso"
          detalle={`Termina en ${tiempoRestante(Math.max(0, minutosHasta(enCurso.endAt, ahora)))}`}
        />
      ) : null}

      {proxima ? (
        <BloqueDestacado
          item={proxima}
          offset={offset}
          tono="proxima"
          rotulo="Próxima clase"
          detalle={
            minutosHasta(proxima.startAt, ahora) <= 0
              ? 'Comienza ahora'
              : `Comienza en ${tiempoRestante(minutosHasta(proxima.startAt, ahora))}`
          }
        />
      ) : null}
    </div>
  );
}

function BloqueDestacado({
  item,
  offset,
  tono,
  rotulo,
  detalle,
}: {
  item: AgendaItem;
  offset: number;
  tono: 'curso' | 'proxima';
  rotulo: string;
  detalle: string;
}) {
  const enCurso = tono === 'curso';

  return (
    <Card
      className={cn(
        'relative overflow-hidden p-5',
        enCurso ? 'border-danger/40 bg-danger-soft/40' : 'border-primary/30 bg-primary/[0.04]',
      )}
    >
      <span
        className={cn('absolute inset-y-0 left-0 w-1', enCurso ? 'bg-danger' : 'bg-primary')}
        aria-hidden
      />

      <div className="flex items-center gap-2 pl-2">
        {enCurso ? (
          <Radio className="size-3.5 shrink-0 text-danger" aria-hidden />
        ) : (
          <Timer className="size-3.5 shrink-0 text-primary" aria-hidden />
        )}
        <span
          className={cn(
            'text-caption font-bold uppercase tracking-wide',
            enCurso ? 'text-danger' : 'text-primary',
          )}
        >
          {rotulo}
        </span>
      </div>

      <h3 className="mt-2 pl-2 text-h3 font-bold text-text">{item.title || item.subjectName || 'Clase'}</h3>

      <p className="mt-1 pl-2 text-body text-muted">
        {horaCampus(item.startAt, offset)} – {horaCampus(item.endAt, offset)}
        {item.date ? ` · ${item.date}` : null}
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 pl-2 text-caption text-muted">
        {item.classroom ? (
          <span className="flex items-center gap-1">
            <MapPin className="size-3.5" aria-hidden />
            Aula {item.classroom}
          </span>
        ) : null}
        {item.groupName ? (
          <span className="flex items-center gap-1">
            <Users className="size-3.5" aria-hidden />
            Grupo {item.groupName}
          </span>
        ) : null}
        {item.teacherName ? (
          <span className="flex items-center gap-1">
            <DoorOpen className="size-3.5" aria-hidden />
            {item.teacherName}
          </span>
        ) : null}
      </div>

      <p
        className={cn(
          'mt-3 pl-2 text-body font-semibold',
          enCurso ? 'text-danger' : 'text-primary',
        )}
      >
        {detalle}
      </p>
    </Card>
  );
}
