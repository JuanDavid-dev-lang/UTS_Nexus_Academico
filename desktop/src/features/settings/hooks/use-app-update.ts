import { useCallback, useEffect, useState } from 'react';
import {
  checkForUpdate,
  currentVersion,
  installUpdate,
  type DownloadProgress,
  type UpdateInfo,
} from '@/core/platform/updater';
import { isDesktop } from '@/core/platform/tauri';

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
  const [error, setError] = useState<string | null>(null);
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

  const check = useCallback(async () => {
    if (!isDesktop) return setStatus('unsupported');
    setStatus('checking');
    setError(null);
    try {
      const found = await checkForUpdate();
      setUpdate(found);
      setStatus(found ? 'available' : 'up-to-date');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo consultar el servidor de actualizaciones.');
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
      setError(cause instanceof Error ? cause.message : 'La actualización no se pudo instalar.');
      setStatus('error');
    }
  }, []);

  // Comprobación silenciosa al abrir Configuración.
  useEffect(() => {
    void check();
  }, [check]);

  return { status, update, progress, error, installed, check, install };
}
