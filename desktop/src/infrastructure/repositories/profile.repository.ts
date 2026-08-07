import { z } from 'zod';
import { http, request } from '@/core/api/http-client';

/**
 * Perfil propio del docente.
 *
 * Va contra `/professors/me` y no contra `/professors/:id` a propósito: en la
 * ruta por id el servidor tendría que confiar en que el cliente manda su propio
 * identificador, y esa confianza es justo lo que no debe existir.
 */

const profileSchema = z.object({
  _id: z.string(),
  title: z.string().nullish(),
  department: z.string().nullish(),
  photoUrl: z.string().nullish(),
  employeeCode: z.string().nullish(),
  sede: z.string().nullish(),
  facultad: z.string().nullish(),
  estado: z.string().nullish(),
});
export type Profile = z.infer<typeof profileSchema>;

const profileResponse = z.object({ ok: z.literal(true), item: profileSchema });

const uploadResponse = z.object({
  ok: z.literal(true),
  file: z.object({ url: z.string() }),
});

export type ProfileUpdate = {
  fullName?: string;
  title?: string;
  department?: string;
  photoUrl?: string | null;
};

export const profileRepository = {
  async me(): Promise<Profile> {
    return (await http.get('/professors/me', { schema: profileResponse })).item;
  },

  async update(input: ProfileUpdate): Promise<Profile> {
    return (await http.patch('/professors/me', input, { schema: profileResponse })).item;
  },

  /**
   * Sube una imagen y devuelve su ruta.
   *
   * El cuerpo es `FormData`: el cliente HTTP lo detecta y deja que el navegador
   * ponga el `Content-Type` con su `boundary`, que es lo que hace que el
   * multipart sea legible del otro lado.
   */
  async uploadImage(file: File): Promise<string> {
    const body = new FormData();
    body.append('file', file);
    const data = await request('/uploads/image', {
      method: 'POST',
      body,
      schema: uploadResponse,
    });
    return data.file.url;
  },
};
