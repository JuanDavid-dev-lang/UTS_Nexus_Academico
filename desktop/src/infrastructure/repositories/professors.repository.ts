import {
  Catalogo,
  ProfesorAdmin,
  Solicitud,
  SolicitudRegistro,
  catalogoSchema,
  http,
  itemResponse,
  itemsResponse,
  paginaResponse,
  okResponse,
  profesorAdminSchema,
  solicitudSchema,
  z,
} from './academic-base';

/**
 * Gestión administrativa de docentes.
 *
 * Es la pantalla donde la administración busca a un docente por carrera y le
 * activa (o quita) la dirección de trabajos de grado. El flag es institucional:
 * el propio docente no puede dárselo (por eso va a `PATCH /professors/:id`,
 * nunca a `/me`).
 */
export const professorAdminRepository = {
  async list(filtro?: { q?: string; programa?: string; director?: boolean }): Promise<ProfesorAdmin[]> {
    const data = await http.get('/professors', {
      schema: itemsResponse(profesorAdminSchema),
      query: {
        q: filtro?.q,
        programa: filtro?.programa,
        director: filtro?.director ? 'true' : undefined,
      },
    });
    return data.items;
  },

  /**
   * Una página del listado de docentes. La usa la pantalla de administración.
   *
   * Con varias universidades en la misma instalación, «todos los docentes» deja
   * de ser una lista que quepa de una vez: el tope por defecto del backend son
   * 100 y no avisa de lo que recorta más allá de `hasMore`.
   */
  async listarPagina(
    filtro: { q?: string; programa?: string; director?: boolean; institutionId?: string } | undefined,
    pagina: { page: number; limit: number },
  ): Promise<{ items: ProfesorAdmin[]; total: number; hasMore: boolean }> {
    const data = await http.get('/professors', {
      schema: paginaResponse(profesorAdminSchema),
      query: { ...(filtro ?? {}), page: pagina.page, limit: pagina.limit },
    });
    return { items: data.items, total: data.total, hasMore: data.hasMore };
  },

  async setDirector(id: string, esDirector: boolean): Promise<ProfesorAdmin> {
    const data = await http.patch(`/professors/${id}`, { esDirectorTrabajoGrado: esDirector }, {
      schema: itemResponse(profesorAdminSchema),
    });
    return data.item;
  },
};

/**
 * Registro de docentes y avisos institucionales.
 *
 * `catalogo` y `solicitar` van sin token a propósito: el formulario de registro
 * los necesita antes de que exista la cuenta.
 */
export const registroRepository = {
  async catalogo(): Promise<Catalogo> {
    return http.get('/registro/catalogo', { schema: catalogoSchema, anonymous: true });
  },

  async solicitar(input: SolicitudRegistro): Promise<{ message: string }> {
    return http.post('/registro', input, {
      schema: z.object({ ok: z.literal(true), message: z.string() }),
      anonymous: true,
    });
  },

  async estado(): Promise<{ abierto: boolean; pendientes: number }> {
    return http.get('/registro/estado', {
      schema: z.object({ ok: z.literal(true), abierto: z.boolean(), pendientes: z.number() }),
    });
  },

  async cambiarEstado(abierto: boolean): Promise<{ abierto: boolean }> {
    return http.patch('/registro/estado', { abierto }, {
      schema: z.object({ ok: z.literal(true), abierto: z.boolean() }),
    });
  },

  async solicitudes(estado: 'PENDIENTE' | 'APROBADO' | 'RECHAZADO' = 'PENDIENTE'): Promise<Solicitud[]> {
    const data = await http.get('/registro/solicitudes', {
      schema: itemsResponse(solicitudSchema),
      query: { estado },
    });
    return data.items;
  },

  async decidir(id: string, decision: 'APROBADO' | 'RECHAZADO', motivo = ''): Promise<void> {
    await http.patch(`/registro/solicitudes/${id}`, { decision, motivo }, { schema: okResponse });
  },
};
