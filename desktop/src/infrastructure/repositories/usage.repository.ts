import { http } from '@/core/api/http-client';
import { okResponse } from '@/domain/schemas/common';
import { rankingUsoSchema, resumenUsoSchema, type FilaRankingUso, type ResumenUso } from '@/domain/schemas/usage';
import { AVISO_USO_VERSION } from '@/domain/usage/aviso-uso';

export type FiltroUso = {
  desde?: string;
  hasta?: string;
  institutionId?: string;
  rol?: string;
};

const consulta = (filtro: FiltroUso) => ({
  desde: filtro.desde || undefined,
  hasta: filtro.hasta || undefined,
  institutionId: filtro.institutionId || undefined,
  rol: filtro.rol || undefined,
});

export const usageRepository = {
  /** Cifras y gráfico. Pide una sola fila de ranking: la tabla va por `ranking()`. */
  async resumen(filtro: FiltroUso): Promise<ResumenUso> {
    return http.get('/uso/resumen', { schema: resumenUsoSchema, query: { ...consulta(filtro), limit: 1 } });
  },

  async ranking(
    filtro: FiltroUso & { page: number; limit: number },
  ): Promise<{ items: FilaRankingUso[]; total: number; hasMore: boolean }> {
    const data = await http.get('/uso/ranking', {
      schema: rankingUsoSchema,
      query: { ...consulta(filtro), page: filtro.page, limit: filtro.limit },
    });
    return { items: data.items, total: data.total, hasMore: data.hasMore };
  },

  /** Libro con el ranking completo. `GET`: exportar es leer. */
  async exportar(filtro: FiltroUso): Promise<Blob> {
    return http.blob('/uso/export.xlsx', consulta(filtro));
  },

  /** Marca visto el aviso de uso y privacidad de la propia cuenta. */
  async marcarAvisoVisto(): Promise<void> {
    await http.post('/auth/aviso-uso', { version: AVISO_USO_VERSION }, { schema: okResponse });
  },
};
