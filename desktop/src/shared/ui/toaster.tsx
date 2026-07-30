import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { useToasts, type ToastTone } from '@/state/toast.store';
import { cn } from '@/shared/lib/cn';

const TONE_STYLES: Record<ToastTone, { icon: React.ReactNode; accent: string }> = {
  success: { icon: <CheckCircle2 className="size-5 text-success" aria-hidden />, accent: 'bg-success' },
  error: { icon: <XCircle className="size-5 text-danger" aria-hidden />, accent: 'bg-danger' },
  warning: { icon: <AlertTriangle className="size-5 text-warning" aria-hidden />, accent: 'bg-warning' },
  info: { icon: <Info className="size-5 text-info" aria-hidden />, accent: 'bg-info' },
};

/**
 * Toast viewport.
 *
 * `aria-live="polite"` announces new toasts without interrupting whatever the
 * screen reader is currently saying.
 */
export function Toaster() {
  const toasts = useToasts((state) => state.toasts);
  const dismiss = useToasts((state) => state.dismiss);

  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2"
      role="region"
      aria-live="polite"
      aria-label="Notificaciones"
    >
      <AnimatePresence initial={false}>
        {toasts.map((toast) => {
          const { icon, accent } = TONE_STYLES[toast.tone];
          return (
            <motion.div
              key={toast.id}
              layout
              initial={{ opacity: 0, x: 24, scale: 0.96 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 24, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              className="pointer-events-auto surface-card relative flex gap-3 overflow-hidden p-4 shadow-lg"
            >
              <span className={cn('absolute inset-y-0 left-0 w-1', accent)} aria-hidden />
              <span className="mt-0.5 shrink-0">{icon}</span>

              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <p className="text-body font-semibold text-text">{toast.title}</p>
                {toast.description ? (
                  <p className="text-caption leading-relaxed text-muted" data-selectable>
                    {toast.description}
                  </p>
                ) : null}
                {toast.action ? (
                  <button
                    type="button"
                    onClick={() => {
                      toast.action?.onClick();
                      dismiss(toast.id);
                    }}
                    className="mt-1 self-start text-caption font-semibold text-primary hover:underline"
                  >
                    {toast.action.label}
                  </button>
                ) : null}
              </div>

              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                aria-label="Cerrar notificación"
                className="shrink-0 self-start rounded-md p-1 text-muted transition-colors hover:bg-surface-alt hover:text-text"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
