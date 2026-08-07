import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { Button } from '@/shared/ui/button';

/**
 * Modal dialog.
 *
 * Built on Radix so focus trapping, Escape handling, scroll locking and the
 * `aria-modal` wiring are correct. Getting those right by hand is where
 * hand-rolled modals usually fail.
 */
export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({
  className,
  children,
  title,
  description,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  title: string;
  description?: string;
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        className="anim-overlay fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
      />
      <DialogPrimitive.Content
        className={cn(
          'anim-popup fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2',
          /*
           * El diálogo estaba centrado sin techo de altura ni desbordamiento.
           * Un formulario más alto que la ventana —el de avisos con sus 32
           * programas, o cualquiera con el escalado de Windows al 150%— se
           * salía por arriba y por abajo a la vez, sin barra: el contenido
           * cortado no era alcanzable de ninguna forma.
           *
           * Se acota a la ventana y el cuerpo pasa a tener su propio
           * desplazamiento. `dvh` y no `vh` porque en una ventana con barras
           * dinámicas `vh` mide el alto máximo, no el visible.
           */
          'flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-lg flex-col',
          'surface-card shadow-pop',
          className,
        )}
        {...props}
      >
        {/* La cabecera no se desplaza: es lo que dice qué es este diálogo. */}
        <div className="flex shrink-0 flex-col gap-1 px-6 pb-4 pr-14 pt-6">
          <DialogPrimitive.Title className="text-h3 font-semibold text-text">
            {title}
          </DialogPrimitive.Title>
          {description ? (
            <DialogPrimitive.Description className="text-body text-muted">
              {description}
            </DialogPrimitive.Description>
          ) : null}
        </div>

        <div className="scrollbar-slim min-h-0 flex-1 overflow-y-auto px-6 pb-6">
          {children}
        </div>

        <DialogPrimitive.Close
          className="absolute right-4 top-4 rounded-md p-1.5 text-muted transition-colors hover:bg-surface-alt hover:text-text"
          aria-label="Cerrar"
        >
          <X className="size-4" aria-hidden />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

/**
 * Pie del diálogo.
 *
 * Va pegado al fondo del área desplazable: en un formulario largo, el botón que
 * confirma no debería exigir llegar al final para existir. Los márgenes
 * negativos lo sangran hasta los bordes del diálogo — sin ellos el contenido se
 * vería pasar por los 24px de relleno lateral, por debajo del pie.
 */
export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'sticky bottom-0 -mx-6 -mb-6 mt-6 flex flex-wrap justify-end gap-2',
        'border-t border-border bg-surface px-6 py-4',
        className,
      )}
      {...props}
    />
  );
}

/**
 * Confirmation dialog for destructive actions.
 *
 * Deleting a student wipes their grades and attendance. That deserves an
 * explicit confirmation naming exactly what is about to disappear.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Eliminar',
  onConfirm,
  loading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  onConfirm: () => void;
  loading?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={title} description={description} className="max-w-md">
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button variant="danger" onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
