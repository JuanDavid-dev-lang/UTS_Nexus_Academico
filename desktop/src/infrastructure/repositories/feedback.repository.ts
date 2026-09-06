import {
  EstadoFeedback,
  Feedback,
  FeedbackInput,
  TipoFeedback,
  feedbackSchema,
  http,
  itemResponse,
  itemsResponse,
  paginaResponse,
  okResponse,
} from './academic-base';

/**
 * Buzón de sugerencias de la aplicación.
 *
 * El docente escribe y ve solo lo suyo; la administración ve todo y cambia el
 * estado. El servidor decide qué devuelve según el rol — aquí no se filtra.
 */
export const feedbackRepository = {
  async list(filtro?: { estado?: EstadoFeedback; tipo?: TipoFeedback }): Promise<Feedback[]> {
    const data = await http.get('/feedback', {
      schema: itemsResponse(feedbackSchema),
      query: { estado: filtro?.estado, tipo: filtro?.tipo },
    });
    return data.items;
  },

  /** Una página de la bandeja. */
  async listarPagina(
    filtro: { estado?: EstadoFeedback; tipo?: TipoFeedback } | undefined,
    pagina: { page: number; limit: number },
  ): Promise<{ items: Feedback[]; total: number; hasMore: boolean }> {
    const data = await http.get('/feedback', {
      schema: paginaResponse(feedbackSchema),
      query: { ...(filtro ?? {}), page: pagina.page, limit: pagina.limit },
    });
    return { items: data.items, total: data.total, hasMore: data.hasMore };
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
