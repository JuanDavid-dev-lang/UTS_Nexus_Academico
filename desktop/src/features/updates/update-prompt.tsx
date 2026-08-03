import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Sparkles } from 'lucide-react';
import { Button, Dialog, DialogContent, DialogFooter } from '@/shared/ui';
import { checkForUpdate, installUpdate, type DownloadProgress, type UpdateInfo } from '@/core/platform/updater';
import { isDesktop } from '@/core/platform/tauri';

/**
 * Aviso de versión nueva al abrir la app.
 *
 * Antes la comprobación solo ocurría dentro de Configuración, así que quien no
 * entraba ahí se quedaba en una versión vieja indefinidamente — y una versión
 * vieja puede ser justo la que tiene el fallo que se acaba de corregir.
 *
 * Interrumpe una vez y no insiste: «Más tarde» calla el aviso para esa versión
 * concreta, no para siempre. La siguiente que se publique vuelve a preguntar.
 */

/** Versión ya pospuesta por el usuario. Se recuerda entre arranques. */
const CLAVE_POSPUESTA = 'uts.actualizacion.pospuesta';

/** Cada seis horas por si la sesión se queda abierta días. */
const INTERVALO_MS = 6 * 60 * 60 * 1000;

/** Espera a que la ventana termine de abrir antes de tapar nada. */
const RETRASO_INICIAL_MS = 4000;

function pospuesta(): string | null {
  try {
    return localStorage.getItem(CLAVE_POSPUESTA);
  } catch {
    // Modo privado o almacenamiento bloqueado: preguntar de más es preferible
    // a no avisar nunca.
    return null;
  }
}

function posponer(version: string): void {
  try {
    localStorage.setItem(CLAVE_POSPUESTA, version);
  } catch {
    // Si no se puede recordar, el aviso reaparecerá. Molesto, no roto.
  }
}

function porcentaje(progress: DownloadProgress | null): number | null {
  if (!progress?.total) return null;
  return Math.min(100, Math.round((progress.downloaded / progress.total) * 100));
}

export function UpdatePrompt() {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [instalando, setInstalando] = useState(false);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const instalandoRef = useRef(false);

  const buscar = useCallback(async () => {
    // No interrumpir una descarga en curso con una comprobación de fondo.
    if (instalandoRef.current) return;
    try {
      const encontrada = await checkForUpdate();
      if (!encontrada || pospuesta() === encontrada.version) return;
      setUpdate(encontrada);
    } catch {
      // Un fallo al comprobar no se le enseña a nadie: la app funciona igual y
      // la tarjeta de Configuración sí explica el motivo a quien lo busque.
    }
  }, []);

  useEffect(() => {
    if (!isDesktop) return;

    const primera = window.setTimeout(() => void buscar(), RETRASO_INICIAL_MS);
    const periodica = window.setInterval(() => void buscar(), INTERVALO_MS);
    return () => {
      window.clearTimeout(primera);
      window.clearInterval(periodica);
    };
  }, [buscar]);

  async function actualizar() {
    setInstalando(true);
    instalandoRef.current = true;
    setError(null);
    setProgress({ downloaded: 0, total: null });
    try {
      // No devuelve: el proceso se reemplaza al reiniciar.
      await installUpdate(setProgress);
    } catch (causa) {
      setError(causa instanceof Error ? causa.message : 'La actualización no se pudo instalar.');
      setInstalando(false);
      instalandoRef.current = false;
    }
  }

  function masTarde() {
    if (update) posponer(update.version);
    setUpdate(null);
  }

  if (!update) return null;

  const avance = porcentaje(progress);

  return (
    <Dialog open onOpenChange={abierto => !abierto && !instalando && masTarde()}>
      <DialogContent
        title={`Versión ${update.version} disponible`}
        description={`Tienes instalada la ${update.currentVersion}. La actualización se descarga, se verifica y la app se reinicia sola.`}
        className="max-w-md"
      >
        <div className="flex flex-col gap-3">
          {update.notes.trim() && (
            <div className="rounded-lg border border-border p-3">
              <p className="mb-1 flex items-center gap-2 text-caption font-semibold text-text">
                <Sparkles className="size-4 text-primary" aria-hidden />
                Qué trae
              </p>
              <p className="max-h-40 overflow-y-auto whitespace-pre-line text-caption text-muted">
                {update.notes.trim()}
              </p>
            </div>
          )}

          {instalando && (
            <div>
              <p className="mb-1 text-caption text-muted">
                {avance === null ? 'Descargando…' : `Descargando… ${avance}%`}
              </p>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-alt">
                <div
                  className="h-full rounded-full bg-primary transition-[width]"
                  style={{ width: `${avance ?? 15}%` }}
                />
              </div>
            </div>
          )}

          {error && <p className="text-caption text-danger">{error}</p>}

          <DialogFooter>
            <Button variant="ghost" onClick={masTarde} disabled={instalando}>
              Más tarde
            </Button>
            <Button variant="primary" onClick={() => void actualizar()} loading={instalando}>
              <Download className="size-4" aria-hidden />
              Actualizar ahora
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
