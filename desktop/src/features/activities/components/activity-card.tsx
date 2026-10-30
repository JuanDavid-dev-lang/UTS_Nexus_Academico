import { forwardRef } from 'react';
import { CalendarClock, CheckCircle2, Clock, Link2, Pencil, RotateCcw, Trash2 } from 'lucide-react';
import { Badge, Button } from '@/shared/ui';
import { cn } from '@/shared/lib/cn';
import { horaCampus, nombreDia, partesCampus, tiempoRestante } from '@/domain/agenda/calendar';
import { minutosHasta } from '@/features/agenda/hooks/use-agenda';
import type { Actividad, EstadoActividad } from '@/domain/schemas/activities';

const ESTADO: Record<EstadoActividad, { tono: 'success' | 'warning' | 'info'; texto: string; Icono: typeof Clock }> = {
  OPEN: { tono: 'info', texto: 'Abierta', Icono: Clock },
  CLOSED: { tono: 'success', texto: 'Cerrada', Icono: CheckCircle2 },
  LATE: { tono: 'warning', texto: 'Vencida', Icono: CalendarClock },
};

const MES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** Solo http(s): un `javascript:` guardado como adjunto no debe abrirse. */
function enlaceSeguro(url: string | null): string | null {
  if (!url) return null;
  try {
    const { protocol } = new URL(url);
    return protocol === 'http:' || protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

type Props = {
  actividad: Actividad;
  materia: string;
  offset: number;
  ahora: Date;
  resaltada: boolean;
  puedeEscribir: boolean;
  puedeReabrir: boolean;
  onEditar: () => void;
  onCambiarEstado: (abrir: boolean) => void;
  onBorrar: () => void;
};

/**
 * Una actividad en la línea de tiempo: la fecha en una ficha de calendario a
 * la izquierda —se lee de un vistazo, como en la agenda—, y al lado qué es,
 * de qué materia y cuánto falta.
 *
 * El «vence en 3 días» es presentación con el reloj local, igual que en la
 * agenda; si está vencida o no lo dice el `estado` del servidor.
 */
export const ActivityCard = forwardRef<HTMLDivElement, Props>(function ActivityCard(
  { actividad, materia, offset, ahora, resaltada, puedeEscribir, puedeReabrir, onEditar, onCambiarEstado, onBorrar },
  ref,
) {
  const estado = ESTADO[actividad.estado];
  const partes = partesCampus(actividad.dueAt, offset);
  const adjunto = enlaceSeguro(actividad.attachmentUrl);
  const minutos = minutosHasta(actividad.dueAt, ahora);
  const cuando =
    actividad.estado === 'OPEN'
      ? minutos > 0
        ? `vence en ${tiempoRestante(minutos)}`
        : 'vence ahora'
      : actividad.estado === 'LATE'
        ? 'venció sin cerrarse'
        : 'cerrada';

  return (
    <div
      ref={ref}
      id={`actividad-${actividad._id}`}
      className={cn(
        'surface-card flex items-stretch gap-3 p-3 transition-colors hover:border-border-strong',
        resaltada && 'ring-2 ring-accent',
        actividad.estado === 'CLOSED' && 'opacity-75',
      )}
    >
      {/* Ficha de calendario: el día grande y el mes debajo. */}
      <div
        className={cn(
          'flex w-14 shrink-0 flex-col items-center justify-center rounded-md border py-1.5',
          actividad.estado === 'LATE'
            ? 'border-warning-border bg-warning-soft text-warning'
            : actividad.estado === 'CLOSED'
              ? 'border-border bg-surface-alt text-muted'
              : 'border-primary-tint bg-primary-soft text-primary',
        )}
        aria-hidden
      >
        <span className="text-h3 font-semibold leading-none tabular">{partes.dia}</span>
        <span className="text-caption">{MES_CORTO[partes.mes - 1]}</span>
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-body font-semibold text-text">{actividad.title}</span>
          <Badge tone={estado.tono} size="sm">
            <estado.Icono className="size-3.5" aria-hidden />
            {estado.texto}
          </Badge>
          {actividad.weight > 0 ? (
            <Badge tone="neutral" size="sm">
              {Math.round(actividad.weight * 100)} % del corte
            </Badge>
          ) : null}
        </div>
        <p className="text-caption text-muted">
          <span className="font-medium text-text">{materia}</span> · {nombreDia(new Date(actividad.dueAt), offset)}{' '}
          {horaCampus(actividad.dueAt, offset)} ·{' '}
          <span className={cn(actividad.estado === 'LATE' && 'text-warning')}>{cuando}</span>
        </p>
        {actividad.description ? (
          <p className="line-clamp-2 text-caption text-muted">{actividad.description}</p>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-0.5 self-center">
        {adjunto ? (
          <Button variant="ghost" size="icon" asChild aria-label="Abrir el archivo adjunto">
            <a href={adjunto} target="_blank" rel="noopener noreferrer">
              <Link2 className="size-4" aria-hidden />
            </a>
          </Button>
        ) : null}

        {puedeEscribir ? (
          <>
            <Button variant="ghost" size="icon" aria-label={`Editar ${actividad.title}`} onClick={onEditar}>
              <Pencil className="size-4" aria-hidden />
            </Button>
            {actividad.status === 'CLOSED' ? (
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Reabrir ${actividad.title}`}
                // Reabrir cambia lo que se le puede exigir a un estudiante
                // pasada la fecha: no es del docente.
                disabled={!puedeReabrir}
                title={puedeReabrir ? undefined : 'Reabrir requiere permiso de coordinación.'}
                onClick={() => onCambiarEstado(true)}
              >
                <RotateCcw className="size-4" aria-hidden />
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Cerrar ${actividad.title}`}
                title="Marcar como cerrada"
                onClick={() => onCambiarEstado(false)}
              >
                <CheckCircle2 className="size-4" aria-hidden />
              </Button>
            )}
            <Button variant="ghost" size="icon" aria-label={`Eliminar ${actividad.title}`} onClick={onBorrar}>
              <Trash2 className="size-4 text-danger" aria-hidden />
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
});
