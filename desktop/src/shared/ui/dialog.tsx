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
          'anim-popup fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2',
          'surface-card p-6 shadow-pop',
          className,
        )}
        {...props}
      >
        <div className="mb-4 flex flex-col gap-1 pr-8">
          <DialogPrimitive.Title className="text-h3 font-semibold text-text">
            {title}
          </DialogPrimitive.Title>
          {description ? (
            <DialogPrimitive.Description className="text-body text-muted">
              {description}
            </DialogPrimitive.Description>
          ) : null}
        </div>

        {children}

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

export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mt-6 flex justify-end gap-2', className)} {...props} />;
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
