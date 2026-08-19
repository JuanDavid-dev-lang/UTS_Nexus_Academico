import {
  EnlacesDescarga,
  http,
} from './academic-base';
import { z } from 'zod';
import { enlacesDescargaSchema } from '@/domain/schemas/downloads';

/** Respuesta del listado público de enlaces de descarga. */
const respuestaEnlaces = z.object({ ok: z.literal(true), enlaces: enlacesDescargaSchema });

export const descargaRepository = {
  async get(): Promise<EnlacesDescarga> {
    return (await http.get('/descargas', { schema: respuestaEnlaces })).enlaces;
  },

  async save(enlaces: EnlacesDescarga): Promise<EnlacesDescarga> {
    return (await http.put('/descargas', enlaces, { schema: respuestaEnlaces })).enlaces;
  },
};
