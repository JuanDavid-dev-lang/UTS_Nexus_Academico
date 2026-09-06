import { http } from '@/core/api/http-client';
import { itemsResponse } from '@/domain/schemas/common';
import {
  enlaceUniPlannerSchema,
  envioUniPlannerSchema,
  estadoUniPlannerSchema,
  type EnlaceUniPlanner,
  type EnvioUniPlanner,
  type EstadoUniPlanner,
} from '@/domain/schemas/uniplanner';

/**
 * Adaptador del puente con UniPlanner.
 *
 * Fino a propósito, como los demás: **ninguna de estas llamadas manda el dato
 * que se va a publicar**. Se dice a quién avisar y de qué materia; las faltas y
 * la nota las lee el servidor de su propia base. Mandarlas desde aquí
 * convertiría «avisar» en «escribir un número en la app de otra persona».
 */
export const uniplannerRepository = {
  async estado(): Promise<EstadoUniPlanner> {
    return http.get('/uniplanner/estado', { schema: estadoUniPlannerSchema });
  },

  async enlaces(filtro: { subjectId: string; period?: string }): Promise<EnlaceUniPlanner[]> {
    const data = await http.get('/uniplanner/enlaces', {
      schema: itemsResponse(enlaceUniPlannerSchema),
      query: { subjectId: filtro.subjectId, period: filtro.period },
    });
    return data.items;
  },

  async avisarInasistencia(input: {
    subjectId: string;
    period?: string;
    studentIds?: string[];
    desde?: 'AMARILLO' | 'ROJO';
    corte?: string;
    mensaje?: string;
  }): Promise<EnvioUniPlanner> {
    return http.post('/uniplanner/avisos/inasistencia', input, { schema: envioUniPlannerSchema });
  },

  async avisarNota(input: {
    subjectId: string;
    corte: number;
    period?: string;
    studentIds?: string[];
    mensaje?: string;
  }): Promise<EnvioUniPlanner> {
    return http.post('/uniplanner/avisos/nota', input, { schema: envioUniPlannerSchema });
  },

  async avisarEntrega(input: {
    subjectId: string;
    period?: string;
    studentIds?: string[];
    titulo: string;
    fecha?: string;
    hora?: string;
    mensaje?: string;
  }): Promise<EnvioUniPlanner> {
    return http.post('/uniplanner/avisos/entrega', input, { schema: envioUniPlannerSchema });
  },
};
