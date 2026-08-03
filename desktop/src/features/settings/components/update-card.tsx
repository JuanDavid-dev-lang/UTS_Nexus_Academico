import { AlertTriangle, Check, Download, RefreshCw } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Progress,
} from '@/shared/ui';
import { nombreVersion } from '@/core/version';
import { useAppUpdate } from '../hooks/use-app-update';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function UpdateCard() {
  const { status, update, progress, error, installed, check, install } = useAppUpdate();

  const percent =
    progress && progress.total ? Math.min(100, Math.round((progress.downloaded / progress.total) * 100)) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Download className="size-4 text-muted" aria-hidden />
          Actualizaciones
        </CardTitle>
        <CardDescription>
          Versión instalada{' '}
          <strong className="font-semibold text-text">{nombreVersion(installed)}</strong>
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {status === 'unsupported' && (
          <p className="text-body text-muted">
            En modo navegador no hay instalador que reemplazar. Abre la app de escritorio para actualizar.
          </p>
        )}

        {status === 'checking' && (
          <p className="flex items-center gap-2 text-body text-muted">
            <RefreshCw className="size-4 animate-spin" aria-hidden />
            Buscando una versión nueva…
          </p>
        )}

        {status === 'up-to-date' && (
          <p className="flex items-center gap-2 text-body text-success">
            <Check className="size-4" aria-hidden />
            Ya tienes la última versión.
          </p>
        )}

        {status === 'available' && update && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Badge tone="info">Versión {update.version} disponible</Badge>
            </div>
            {update.notes && (
              <p className="whitespace-pre-line text-body text-muted">{update.notes}</p>
            )}
            <p className="text-caption text-muted">
              La app se reiniciará sola al terminar de instalar.
            </p>
          </div>
        )}

        {status === 'downloading' && (
          <div className="flex flex-col gap-2">
            <p className="text-body text-muted">
              Descargando {update ? `la versión ${update.version}` : 'la actualización'}
              {progress ? ` — ${formatBytes(progress.downloaded)}` : ''}
              {progress?.total ? ` de ${formatBytes(progress.total)}` : ''}
            </p>
            <Progress value={percent ?? 0} label="Progreso de la descarga" />
            <p className="text-caption text-muted">No cierres la aplicación.</p>
          </div>
        )}

        {/* Un fallo que nadie pidió se cuenta en gris y en una línea: la
            aplicación funciona igual y no hay nada que hacer con la noticia.
            El que responde al botón va entero, porque hay alguien esperando. */}
        {status === 'error' && error?.discreto && (
          <p className="text-caption text-muted">
            No se pudo comprobar si hay una versión nueva. La aplicación funciona
            igual; vuelve a intentarlo cuando quieras.
          </p>
        )}

        {status === 'error' && error && !error.discreto && (
          <p className="flex items-start gap-2 text-body text-danger">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {error.mensaje}
          </p>
        )}

        <div className="flex gap-2">
          {status === 'available' ? (
            <Button variant="primary" onClick={() => void install()}>
              <Download className="size-4" aria-hidden />
              Instalar y reiniciar
            </Button>
          ) : (
            <Button
              variant="secondary"
              onClick={() => void check()}
              disabled={status === 'checking' || status === 'downloading' || status === 'unsupported'}
            >
              <RefreshCw className="size-4" aria-hidden />
              Buscar actualizaciones
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
