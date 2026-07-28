import { AlertCircle, Inbox, PlugZap, SearchX } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { AppError, toAppError } from '@/core/api/errors';
import { cn } from '@/shared/lib/cn';

/**
 * Empty, error and offline states.
 *
 * A blank screen is a bug: the user cannot tell whether the app is loading,
 * broken or genuinely has nothing to show. Every state here says what happened
 * and offers the next step.
 */

type StateViewProps = {
  icon: React.ReactNode;
  title: string;
  message: string;
  action?: { label: string; onClick: () => void };
  className?: string;
};

function StateView({ icon, title, message, action, className }: StateViewProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-xl px-6 py-14 text-center',
        className,
      )}
    >
      <div className="flex size-12 items-center justify-center rounded-full bg-surface-alt text-muted">
        {icon}
      </div>
      <h3 className="text-base font-semibold text-text">{title}</h3>
      <p className="max-w-sm text-sm text-muted">{message}</p>
      {action ? (
        <Button variant="primary" size="sm" onClick={action.onClick} className="mt-2">
          {action.label}
        </Button>
      ) : null}
    </div>
  );
}

export function EmptyState({
  title = 'Sin datos todavía',
  message = 'Cuando haya información para mostrar, aparecerá aquí.',
  action,
  className,
}: Partial<Omit<StateViewProps, 'icon'>>) {
  return (
    <StateView
      icon={<Inbox className="size-6" aria-hidden />}
      title={title}
      message={message}
      {...(action ? { action } : {})}
      {...(className ? { className } : {})}
    />
  );
}

export function NoResultsState({ query, onClear }: { query: string; onClear: () => void }) {
  return (
    <StateView
      icon={<SearchX className="size-6" aria-hidden />}
      title="Sin coincidencias"
      message={`No encontramos nada para "${query}".`}
      action={{ label: 'Limpiar búsqueda', onClick: onClear }}
    />
  );
}

/**
 * Error state.
 *
 * Retry is only offered when retrying could actually help - re-running a
 * request that failed with 403 just wastes the user's time.
 */
export function ErrorState({
  error,
  onRetry,
  className,
}: {
  error: unknown;
  onRetry?: () => void;
  className?: string;
}) {
  const appError = error instanceof AppError ? error : toAppError(error);
  const offline = appError.kind === 'network';

  return (
    <StateView
      icon={
        offline ? (
          <PlugZap className="size-6 text-warning" aria-hidden />
        ) : (
          <AlertCircle className="size-6 text-danger" aria-hidden />
        )
      }
      title={offline ? 'Sin conexión con el servidor' : 'No pudimos cargar la información'}
      message={appError.message}
      {...(onRetry && appError.isRetryable
        ? { action: { label: 'Reintentar', onClick: onRetry } }
        : {})}
      {...(className ? { className } : {})}
    />
  );
}
