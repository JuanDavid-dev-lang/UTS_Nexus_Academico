/**
 * Bridge to the native shell.
 *
 * Every native call goes through here, for two reasons: the rest of the app
 * never imports `@tauri-apps/api` directly (so it stays testable), and the app
 * still runs in a plain browser during development, where these calls degrade
 * gracefully instead of throwing.
 */
import { invoke } from '@tauri-apps/api/core';

/** True when running inside the Tauri shell rather than a bare browser tab. */
export const isDesktop: boolean =
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  return invoke<T>(command, args);
}

export type BackendStatus = {
  running: boolean;
  started_by_app: boolean;
  detail: string;
};

/**
 * Browser fallback for the secure store.
 *
 * `sessionStorage` is cleared when the tab closes and is never used in the
 * packaged app, so development convenience does not weaken production storage.
 */
const browserFallback = {
  set: (key: string, value: string) => sessionStorage.setItem(`uts.${key}`, value),
  get: (key: string) => sessionStorage.getItem(`uts.${key}`),
  remove: (key: string) => sessionStorage.removeItem(`uts.${key}`),
};

export const platform = {
  isDesktop,

  secureStore: {
    async set(key: string, value: string): Promise<void> {
      if (!isDesktop) return browserFallback.set(key, value);
      await call<void>('secure_store_set', { key, value });
    },

    async get(key: string): Promise<string | null> {
      if (!isDesktop) return browserFallback.get(key);
      return (await call<string | null>('secure_store_get', { key })) ?? null;
    },

    async remove(key: string): Promise<void> {
      if (!isDesktop) return browserFallback.remove(key);
      await call<void>('secure_store_delete', { key });
    },
  },

  backend: {
    async health(baseUrl: string): Promise<boolean> {
      if (!isDesktop) {
        try {
          const response = await fetch(`${baseUrl}/health`, {
            signal: AbortSignal.timeout(2000),
          });
          return response.ok;
        } catch {
          return false;
        }
      }
      return call<boolean>('backend_health', { baseUrl });
    },

    async ensureRunning(baseUrl: string, timeoutSeconds = 15): Promise<BackendStatus> {
      if (!isDesktop) {
        const running = await platform.backend.health(baseUrl);
        return {
          running,
          started_by_app: false,
          detail: running
            ? 'El servidor responde.'
            : 'En modo navegador la app no puede iniciar el servidor.',
        };
      }
      return call<BackendStatus>('backend_ensure_running', { baseUrl, timeoutSeconds });
    },
  },

  files: {
    /** Writes a blob to the Downloads folder and returns the final path. */
    async saveDownload(fileName: string, blob: Blob): Promise<string> {
      const bytes = Array.from(new Uint8Array(await blob.arrayBuffer()));

      if (!isDesktop) {
        // Browser: fall back to a regular anchor download.
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = fileName;
        anchor.click();
        URL.revokeObjectURL(url);
        return fileName;
      }

      return call<string>('save_download', { fileName, bytes });
    },

    async reveal(path: string): Promise<void> {
      if (!isDesktop) return;
      await call<void>('reveal_in_file_manager', { path });
    },
  },
};
