import {
  EstadoFeedback,
  Feedback,
  FeedbackInput,
  TipoFeedback,
  feedbackSchema,
  http,
  itemResponse,
  itemsResponse,
  okResponse,
} from './academic-base';

export const feedbackRepository = {
  async list(filtro?: { estado?: EstadoFeedback; tipo?: TipoFeedback }): Promise<Feedback[]> {
    const data = await http.get('/feedback', {
      schema: itemsResponse(feedbackSchema),
      query: { estado: filtro?.estado, tipo: filtro?.tipo },
    });
    return data.items;
  },

  async create(input: FeedbackInput & { origen?: string; appVersion?: string }): Promise<Feedback> {
    return (await http.post('/feedback', input, { schema: itemResponse(feedbackSchema) })).item;
  },

  async setEstado(id: string, estado: EstadoFeedback): Promise<Feedback> {
    return (await http.patch(`/feedback/${id}`, { estado }, { schema: itemResponse(feedbackSchema) })).item;
  },

  async remove(id: string): Promise<void> {
    await http.delete(`/feedback/${id}`, { schema: okResponse });
  },
};

/**
 * Enlaces de la página pública de descargas.
 *
 * Viven en el servidor, no en el HTML del sitio, para que publicar una versión
 * no obligue a editar y desplegar la página.
 */
