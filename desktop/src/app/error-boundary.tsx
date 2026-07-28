import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from '@/shared/ui/button';

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
    // Kept as console output on purpose: there is no telemetry backend yet, and
    // silently swallowing this would make desktop bugs impossible to diagnose.
    console.error('[AppErrorBoundary]', error, info.componentStack);
  }

  private readonly reset = () => this.setState({ error: null });

  private readonly reload = () => window.location.reload();

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-bg p-8">
        <span className="grid size-14 place-items-center rounded-2xl bg-danger-soft text-danger">
          <AlertTriangle className="size-7" aria-hidden />
        </span>

        <div className="flex max-w-md flex-col items-center gap-2 text-center">
          <h1 className="text-lg font-bold text-text">La aplicación encontró un problema</h1>
          <p className="text-sm text-muted">
            Puedes volver a la pantalla anterior. Si el problema se repite, reinicia la aplicación.
          </p>
          <pre
            data-selectable
            className="mt-2 max-h-32 w-full overflow-auto rounded-lg bg-surface-alt p-3 text-left font-mono text-[11px] text-muted"
          >
            {error.message}
          </pre>
        </div>

        <div className="flex gap-2">
          <Button variant="secondary" onClick={this.reset}>
            Volver
          </Button>
          <Button variant="primary" onClick={this.reload}>
            <RotateCcw aria-hidden />
            Reiniciar
          </Button>
        </div>
      </div>
    );
  }
}
