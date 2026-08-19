import {
  EnlacesDescarga,
  enlacesDescargaSchema,
  http,
  z,
} from './academic-base';

/** Respuesta del listado público de enlaces de descarga. */
const respuestaEnlaces = z.object({ ok: z.literal(true), enlaces: enlacesDescargaSchema });

/**
 * Enlaces de la página pública de descargas.
 *
 * Viven en el servidor, no en el HTML del sitio, para que publicar una versión
 * no obligue a editar y desplegar la página.
 */
export const descargaRepository = {
  async get(): Promise<EnlacesDescarga> {
    return (await http.get('/descargas', { schema: respuestaEnlaces })).enlaces;
  },

  async save(enlaces: EnlacesDescarga): Promise<EnlacesDescarga> {
    return (await http.put('/descargas', enlaces, { schema: respuestaEnlaces })).enlaces;
  },
};
