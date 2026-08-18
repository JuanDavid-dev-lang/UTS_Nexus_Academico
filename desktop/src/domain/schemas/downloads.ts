/**
 * Enlaces de descarga de las aplicaciones.
 */
import { z } from 'zod';

// ── Enlaces de descarga ─────────────────────────────────────────────────────

/**
 * A dónde apuntan los botones de la página pública de descargas.
 *
 * Se guardan en el servidor y no en el HTML del sitio para que publicar una
 * versión no obligue a editar y desplegar la página. Los mismos hosts que
 * acepta el backend: si aquí se dejara pasar cualquiera, el error saldría al
 * guardar en vez de al escribir.
 */
export const HOSTS_DESCARGA = [
  'dropbox.com',
  'www.dropbox.com',
  'dl.dropboxusercontent.com',
  'github.com',
  'objects.githubusercontent.com',
] as const;

export const enlaceDescarga = z
  .string()
  .trim()
  .max(2000)
  .refine(valor => {
    if (valor === '') return true;
    try {
      const url = new URL(valor);
      return url.protocol === 'https:' && (HOSTS_DESCARGA as readonly string[]).includes(url.hostname);
    } catch {
      return false;
    }
  }, 'Tiene que ser un enlace https de Dropbox o de GitHub.');

export const enlacesDescargaSchema = z.object({
  windows: enlaceDescarga,
  android: enlaceDescarga,
});
export type EnlacesDescarga = z.infer<typeof enlacesDescargaSchema>;
