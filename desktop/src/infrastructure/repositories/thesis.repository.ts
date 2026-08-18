import {
  EtapaTrabajoGrado,
  ThesisFormat,
  http,
  itemResponse,
  itemsResponse,
  okResponse,
  thesisFormatSchema,
} from './academic-base';

export const thesisRepository = {
  async list(filtro?: { etapa?: EtapaTrabajoGrado; q?: string }): Promise<ThesisFormat[]> {
    const data = await http.get('/trabajos-grado/formatos', {
      schema: itemsResponse(thesisFormatSchema),
      query: { etapa: filtro?.etapa, q: filtro?.q },
    });
    return data.items;
  },

  /** Descarga autenticada; los formatos NO están en el estático público. */
  async download(id: string): Promise<Blob> {
    return http.blob(`/trabajos-grado/formatos/${id}/archivo`);
  },

  async upload(input: {
    archivo: File;
    nombre: string;
    descripcion: string;
    etapa: EtapaTrabajoGrado;
    camposALlenar: string[];
    version: string;
  }): Promise<ThesisFormat> {
    const formulario = new FormData();
    formulario.append('file', input.archivo);
    formulario.append('nombre', input.nombre);
    formulario.append('descripcion', input.descripcion);
    formulario.append('etapa', input.etapa);
    formulario.append('camposALlenar', JSON.stringify(input.camposALlenar));
    formulario.append('version', input.version);
    const data = await http.post('/trabajos-grado/formatos', formulario, {
      schema: itemResponse(thesisFormatSchema),
    });
    return data.item;
  },

  async remove(id: string): Promise<void> {
    await http.delete(`/trabajos-grado/formatos/${id}`, { schema: okResponse });
  },
};

/**
 * Registro de docentes y avisos institucionales.
 *
 * `catalogo` y `solicitar` van sin token a propósito: el formulario de registro
 * los necesita antes de que exista la cuenta.
 */
