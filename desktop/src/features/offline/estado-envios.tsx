import { useState } from 'react';
import { AlertTriangle, CloudUpload, RefreshCw } from 'lucide-react';
import { Badge, Button, ConfirmDialog, Dialog, DialogContent, DialogFooter } from '@/shared/ui';
import { cn } from '@/shared/lib/cn';
import { formatDateTime } from '@/shared/lib/format';
import { outbox } from '@/core/offline/outbox';
import { textoDeCola, type OutboxEntry } from '@/domain/offline/outbox';
import { useOutbox, useResumenDeCola } from '@/state/outbox.store';
import { useEnLinea } from '@/state/connectivity.store';

const ESTADO_PRESENTACION = {
  pendiente: { etiqueta: 'Sin enviar', tono: 'warning' },
  enviando: { etiqueta: 'Enviando…', tono: 'primary' },
  fallida: { etiqueta: 'Con error', tono: 'danger' },
} as const;

/**
 * Insignia de la barra superior con lo que espera salir, y la lista para
 * actuar sobre ello. No dice nada cuando no hay nada: en el caso normal la
 * barra no cambia.
 */
export function EstadoEnvios() {
  const resumen = useResumenDeCola();
  const [abierto, setAbierto] = useState(false);

  if (resumen.total === 0) return null;

  const hayError = resumen.fallidas > 0 && resumen.pendientes === 0 && resumen.enviando === 0;
  const Icono = hayError ? AlertTriangle : resumen.enviando > 0 ? RefreshCw : CloudUpload;

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className={cn(
          'no-drag flex items-center gap-1.5 rounded-full border px-2 py-1 text-caption font-medium',
          'transition-colors',
          hayError
            ? 'border-danger-border bg-danger-soft text-danger'
            : 'border-warning-border bg-warning-soft text-warning',
        )}
        aria-label={`${textoDeCola(resumen)}. Abrir la lista de envíos pendientes`}
      >
        <Icono className={cn('size-3.5', resumen.enviando > 0 && 'animate-spin')} aria-hidden />
        <span>{textoDeCola(resumen)}</span>
      </button>
      <PanelDeEnvios open={abierto} onOpenChange={setAbierto} />
    </>
  );
}

function PanelDeEnvios({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const entradas = useOutbox((estado) => estado.entradas);
  const enLinea = useEnLinea();
  const persiste = useOutbox((estado) => estado.persiste);
  const [descartando, setDescartando] = useState<OutboxEntry | null>(null);
  const hayFallidas = entradas.some((e) => e.estado === 'fallida');

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          title="Cambios sin enviar"
          description={
            enLinea
              ? 'Se envían solos, en el orden en que los hiciste. Si uno falla, aquí ves por qué.'
              : persiste
                ? 'Sin conexión con el servidor. Están guardados en este equipo y se envían solos al volver.'
                : 'Sin conexión con el servidor. Se envían solos al volver; no cierres esta ventana hasta entonces.'
          }
          className="max-w-xl"
        >
          {entradas.length === 0 ? (
            <p className="py-6 text-center text-body text-muted">Todo está enviado.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {entradas.map((entrada) => {
                const estado = ESTADO_PRESENTACION[entrada.estado];
                return (
                  <li
                    key={entrada.id}
                    className="flex flex-col gap-1.5 rounded-lg border border-border bg-surface-alt/50 p-3"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="min-w-0 flex-1 text-body font-medium text-text">
                        {entrada.resumen}
                      </span>
                      <Badge tone={estado.tono} size="sm">
                        {estado.etiqueta}
                      </Badge>
                    </div>
                    <p className="text-caption text-muted">
                      Hecho el {formatDateTime(new Date(entrada.createdAt))}
                    </p>
                    {entrada.ultimoError ? (
                      <p className="text-caption text-danger">{entrada.ultimoError}</p>
                    ) : null}
                    <div className="flex justify-end gap-1.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={entrada.estado === 'enviando'}
                        onClick={() => setDescartando(entrada)}
                      >
                        Descartar
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={entrada.estado === 'enviando' || !enLinea}
                        onClick={() => outbox.reintentar(entrada.id)}
                      >
                        Reintentar
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {hayFallidas ? (
            <DialogFooter>
              <Button
                variant="secondary"
                disabled={!enLinea}
                onClick={() => outbox.reintentarFallidas()}
              >
                Reintentar las que fallaron
              </Button>
            </DialogFooter>
          ) : null}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={descartando !== null}
        onOpenChange={(siguiente) => !siguiente && setDescartando(null)}
        title="¿Descartar este cambio?"
        description={
          descartando
            ? `«${descartando.resumen}» no se enviará al servidor y no se podrá recuperar.`
            : ''
        }
        confirmLabel="Descartar"
        onConfirm={() => {
          if (descartando) outbox.descartar(descartando.id);
          setDescartando(null);
        }}
      />
    </>
  );
}
