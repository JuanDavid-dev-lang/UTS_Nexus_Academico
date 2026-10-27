import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { reportarError } from '@/core/telemetry/reporter';
import { recargarSiFaltaVersion } from '@/core/platform/version-nueva';

/**
 * Top-level error boundary.
 *
 * A render error in one screen must not leave the user staring at a white
 * window with no way out. This shows what happened and offers a recovery path.
 */
type Props = { children: ReactNode };
type State = { error: Error | null };

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Un trozo de la versión anterior que ya no existe no es un fallo: es un
    // despliegue nuevo. No todo `import()` pasa por `vite:preloadError`.
    if (recargarSiFaltaVersion(error)) return;

    // La consola se mantiene: es donde se diagnostica en desarrollo, y en un
    // equipo sin sesión iniciada es lo único que queda.
    console.error('[AppErrorBoundary]', error, info.componentStack);

    /*
     * Y además se reporta. La pila del componente vale más que la de la
     * excepción para un fallo de renderizado: dice QUÉ pantalla se rompió, no
     * en qué función interna de React terminó de romperse.
     *
     * `reportarError` deduplica y nunca lanza: un fallo al reportar un fallo
     * no puede tumbar la pantalla de recuperación.
     */
    reportarError(error, {
      categoria: 'render',
      contexto: (info.componentStack ?? '').split('\n').slice(0, 8).join('\n'),
    });
  }

  private readonly reset = () => this.setState({ error: null });

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return <PantallaDeError mensaje={error.message} onVolver={this.reset} />;
  }
}

type PantallaDeErrorProps = { mensaje: string; onVolver: () => void };

/** La misma salida para un fallo fuera del enrutador y dentro de una ruta. */
export function PantallaDeError({ mensaje, onVolver }: PantallaDeErrorProps) {
  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-bg p-8">
      <span className="grid size-14 place-items-center rounded-2xl bg-danger-soft text-danger">
        <AlertTriangle className="size-7" aria-hidden />
      </span>

      <div className="flex max-w-md flex-col items-center gap-2 text-center">
        <h1 className="text-h3 font-bold text-text">La aplicación encontró un problema</h1>
        <p className="text-body text-muted">
          Puedes volver a la pantalla anterior. Si el problema se repite, reinicia la aplicación.
        </p>
        <pre
          data-selectable
          className="mt-2 max-h-32 w-full overflow-auto rounded-lg bg-surface-alt p-3 text-left font-mono text-caption text-muted"
        >
          {mensaje}
        </pre>
      </div>

      <div className="flex gap-2">
        <Button variant="secondary" onClick={onVolver}>
          Volver
        </Button>
        <Button variant="primary" onClick={() => window.location.reload()}>
          <RotateCcw aria-hidden />
          Reiniciar
        </Button>
      </div>
    </div>
  );
}
