/**
 * Auto-update against the signed GitHub Releases manifest.
 *
 * Like the rest of `core/platform`, this is the only module that touches the
 * updater plugin: the UI talks to `updater` and keeps working in a plain
 * browser tab, where there is no installer to replace and every call resolves
 * to "no update available" instead of throwing.
 *
 * The download is verified against the public key baked into `tauri.conf.json`
 * before it is applied, so a tampered release asset is rejected by the shell
 * rather than by anything we could check here.
 */
import { isDesktop } from './tauri';

export type UpdateInfo = {
  version: string;
  currentVersion: string;
  notes: string;
  date: string | null;
};

export type DownloadProgress = {
  /** Bytes already downloaded. */
  downloaded: number;
  /** Total bytes, or null when the server does not send a content length. */
  total: number | null;
};

/** Resolved once per session: the plugin is only bundled in the desktop shell. */
async function updaterApi() {
  return import('@tauri-apps/plugin-updater');
}

/**
 * Looks for a newer release.
 *
 * Returns `null` both when the app is current and when there is nothing to
 * update (browser mode). Network failures are surfaced as a thrown error so the
 * caller can tell "you are up to date" apart from "we could not check".
 */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  if (!isDesktop) return null;

  const { check } = await updaterApi();
  let update: Awaited<ReturnType<typeof check>>;
  try {
    update = await check();
  } catch (causa) {
    throw new Error(explicarFallo(causa));
  }
  if (!update) return null;

  return {
    version: update.version,
    currentVersion: update.currentVersion,
    notes: update.body ?? '',
    date: update.date ?? null,
  };
}

/**
 * Traduce el fallo del plugin a algo que sirva para actuar.
 *
 * Los comandos de Tauri rechazan con una **cadena**, no con un `Error`. La
 * pantalla comprobaba `instanceof Error` y caía siempre al texto de reserva,
 * así que el motivo real —el único dato útil— no llegaba nunca a verse: daba
 * igual no tener red que estar mirando un servidor que ya no publica.
 *
 * El detalle original se conserva al final. Un mensaje amable que se come la
 * causa deja a quien lo lee sin nada que hacer, y a quien lo mantiene sin nada
 * que mirar.
 */
function explicarFallo(causa: unknown): string {
  const detalle = causa instanceof Error ? causa.message : String(causa ?? '');
  const texto = detalle.toLowerCase();

  if (/network|dns|connect|timed out|timeout|unreachable|error sending request/.test(texto)) {
    return `Sin conexión con el servidor de actualizaciones. ${detalle}`;
  }
  // 404 sobre el manifiesto: la publicación existe pero no trae `latest.json`,
  // o esta versión lo busca donde ya nadie lo pone. Se sale de ahí instalando a
  // mano; seguir pulsando el botón no lo arregla.
  if (/404|not found/.test(texto)) {
    return `Esta versión busca las actualizaciones donde ya no se publican. Descarga la última desde la página de descargas. (${detalle})`;
  }
  if (/signature|pubkey|verify/.test(texto)) {
    return `La firma de la actualización no se pudo verificar, así que no se instaló. (${detalle})`;
  }
  return detalle || 'No se pudo consultar el servidor de actualizaciones.';
}

/**
 * Downloads and installs the pending update, then restarts the app.
 *
 * This function does not return on success: the process is replaced by the
 * relaunched one. Anything after the `relaunch()` call only runs if the restart
 * itself failed.
 */
export async function installUpdate(onProgress?: (progress: DownloadProgress) => void): Promise<void> {
  if (!isDesktop) throw new Error('Las actualizaciones solo están disponibles en la app de escritorio.');

  const { check } = await updaterApi();
  const update = await check();
  if (!update) throw new Error('No hay ninguna actualización pendiente.');

  let downloaded = 0;
  let total: number | null = null;

  await update.downloadAndInstall((event) => {
    switch (event.event) {
      case 'Started':
        total = event.data.contentLength ?? null;
        downloaded = 0;
        break;
      case 'Progress':
        downloaded += event.data.chunkLength;
        break;
      case 'Finished':
        downloaded = total ?? downloaded;
        break;
    }
    onProgress?.({ downloaded, total });
  });

  const { relaunch } = await import('@tauri-apps/plugin-process');
  await relaunch();
}

/** Installed version, read from the shell rather than from a bundled constant. */
export async function currentVersion(): Promise<string> {
  if (!isDesktop) return import.meta.env.VITE_APP_VERSION ?? 'dev';
  const { getVersion } = await import('@tauri-apps/api/app');
  return getVersion();
}
