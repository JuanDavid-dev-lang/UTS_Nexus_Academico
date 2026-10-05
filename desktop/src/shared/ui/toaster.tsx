import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { useToasts, type ToastTone } from '@/state/toast.store';

/* El tono lo lleva el icono. La franja de color al filo izquierdo era el
   recurso de alerta más gastado que hay y repetía lo que el icono ya dice. */
const TONE_STYLES: Record<ToastTone, { icon: React.ReactNode }> = {
  success: { icon: <CheckCircle2 className="size-5 text-success" aria-hidden /> },
  error: { icon: <XCircle className="size-5 text-danger" aria-hidden /> },
  warning: { icon: <AlertTriangle className="size-5 text-warning" aria-hidden /> },
  info: { icon: <Info className="size-5 text-info" aria-hidden /> },
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
          const { icon } = TONE_STYLES[toast.tone];
          return (
            <motion.div
              key={toast.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: { duration: 0.12 } }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="pointer-events-auto surface-card relative flex gap-3 overflow-hidden p-4 shadow-lg"
            >
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
