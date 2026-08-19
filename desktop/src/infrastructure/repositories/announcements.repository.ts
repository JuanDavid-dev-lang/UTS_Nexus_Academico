import {
  Aviso,
  AvisoInput,
  avisoSchema,
  http,
  itemResponse,
  okResponse,
  z,
} from './academic-base';

export const avisoRepository = {
  async list(): Promise<{ items: Aviso[]; sinLeer: number }> {
    return http.get('/avisos', {
      schema: z.object({
        ok: z.literal(true),
        items: z.array(avisoSchema),
        sinLeer: z.number(),
      }),
    });
  },

  async create(input: AvisoInput): Promise<Aviso> {
    return (await http.post('/avisos', input, { schema: itemResponse(avisoSchema) })).item;
  },

  /** Cuántos docentes recibirían un aviso con este alcance, antes de publicarlo. */
  async destinatarios(
    alcance: Pick<AvisoInput, 'sedes' | 'facultades' | 'programas'>,
  ): Promise<{ alcanzados: number; total: number }> {
    return http.post('/avisos/destinatarios', alcance, {
      schema: z.object({ ok: z.literal(true), alcanzados: z.number(), total: z.number() }),
    });
  },

  async marcarLeido(id: string): Promise<void> {
    await http.post(`/avisos/${id}/leido`, undefined, { schema: okResponse });
  },

  async remove(id: string): Promise<void> {
    await http.delete(`/avisos/${id}`, { schema: okResponse });
  },
};
