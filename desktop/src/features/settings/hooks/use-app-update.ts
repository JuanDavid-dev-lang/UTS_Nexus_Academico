import { useCallback, useEffect, useState } from 'react';
import {
  checkForUpdate,
  currentVersion,
  installUpdate,
  type DownloadProgress,
  type UpdateInfo,
} from '@/core/platform/updater';
import { isDesktop } from '@/core/platform/tauri';

/**
 * Un fallo al comprobar o instalar.
 *
 * `discreto` distingue el fallo que nadie pidió —la comprobación automática al
 * abrir la pantalla— del que responde a un botón. El primero se cuenta en gris
 * y de pasada; el segundo, entero.
 */
export type FalloDeActualizacion = {
  mensaje: string;
  discreto: boolean;
};

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'up-to-date'
  | 'unsupported'
  | 'error';

/**
 * Drives the update card: check, then download-and-restart.
 *
 * The first check runs on mount so the user is told about a new version without
 * having to look for it, but it never blocks or interrupts: a failed check
 * leaves the app fully usable and only shows the reason inside the card.
 */
export function useAppUpdate() {
  const [status, setStatus] = useState<UpdateStatus>(isDesktop ? 'idle' : 'unsupported');
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [error, setError] = useState<FalloDeActualizacion | null>(null);
  const [installed, setInstalled] = useState<string>('');

  useEffect(() => {
    let active = true;
    currentVersion()
      .then((version) => active && setInstalled(version))
      .catch(() => active && setInstalled('desconocida'));
    return () => {
      active = false;
    };
  }, []);

  /**
   * @param pedida `true` si la persona pulsó el botón.
   *
   * La distinción no es cosmética. Un fallo en la comprobación de apertura no
   * es una respuesta a nada: nadie preguntó, la aplicación funciona igual y no
   * hay nada que hacer con la noticia. Pintarlo en rojo al entrar en
   * Configuración convierte cada visita en un susto y enseña a ignorar los
   * avisos rojos, que es justo lo contrario de lo que sirven. Cuando el fallo
   * responde a un botón sí se cuenta entero: ahí sí hay alguien esperando.
   */
  const check = useCallback(async (pedida = true) => {
    if (!isDesktop) return setStatus('unsupported');
    setStatus('checking');
    setError(null);
    try {
      const found = await checkForUpdate();
      setUpdate(found);
      setStatus(found ? 'available' : 'up-to-date');
    } catch (cause) {
      const mensaje = cause instanceof Error ? cause.message : String(cause ?? '');
      setError({
        mensaje: mensaje || 'No se pudo consultar el servidor de actualizaciones.',
        discreto: !pedida,
      });
      setStatus('error');
    }
  }, []);

  const install = useCallback(async () => {
    setStatus('downloading');
    setError(null);
    setProgress({ downloaded: 0, total: null });
    try {
      await installUpdate(setProgress);
    } catch (cause) {
      const mensaje = cause instanceof Error ? cause.message : String(cause ?? '');
      setError({ mensaje: mensaje || 'La actualización no se pudo instalar.', discreto: false });
      setStatus('error');
    }
  }, []);

  // Comprobación al abrir Configuración. Nadie la pidió, así que si falla se
  // cuenta en gris (ver `check`).
  useEffect(() => {
    void check(false);
  }, [check]);

  return { status, update, progress, error, installed, check, install };
}
