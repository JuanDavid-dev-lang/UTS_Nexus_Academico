import { AlertCircle, Inbox, PlugZap, SearchX } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { AppError, toAppError } from '@/core/api/errors';
import { cn } from '@/shared/lib/cn';
import { avisoDeLectura, esFalloDelServidor } from '@/domain/offline/aviso-servidor';

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
      {/*
        El icono, solo y apagado. Antes iba en dos discos concéntricos con
        sombra, el adorno de estado vacío de cualquier plantilla; un icono
        de trazo sobre el fondo ya dice «aquí todavía no hay nada».
      */}
      <div className="flex text-subtle [&_svg]:size-7">{icon}</div>
      <h3 className="text-body font-semibold text-text">{title}</h3>
      {/* La firma UTS separa el título de la explicación (DESIGN.md §4.1). */}
      <span aria-hidden className="firma firma-filete" />
      <p className="max-w-sm text-caption leading-relaxed text-muted">{message}</p>
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
 *
 * Un fallo del servidor (sin respuesta, tiempo, 5xx) no es un error de la
 * persona ni una avería suya: se dice con calma y sin rojo
 * (`domain/offline/aviso-servidor.ts`). Un 4xx se enseña tal cual.
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
  const offline = esFalloDelServidor(appError);
  const aviso = avisoDeLectura(false);

  return (
    <StateView
      icon={
        offline ? (
          <PlugZap className="size-6 text-warning" aria-hidden />
        ) : (
          <AlertCircle className="size-6 text-danger" aria-hidden />
        )
      }
      title={offline ? aviso.titulo : 'No pudimos cargar la información'}
      message={offline ? aviso.detalle : appError.message}
      {...(onRetry && appError.isRetryable
        ? { action: { label: 'Reintentar', onClick: onRetry } }
        : {})}
      {...(className ? { className } : {})}
    />
  );
}
