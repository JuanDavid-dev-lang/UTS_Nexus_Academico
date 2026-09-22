import { z } from 'zod';
import { http } from '@/core/api/http-client';
import { itemResponse, itemsResponse, okResponse } from '@/domain/schemas/common';
import {
  estructuraNotasSchema,
  plantillaNotasSchema,
  type EstructuraNotas,
  type EstructuraNotasInput,
  type PlantillaNotas,
  type PlantillaNotasInput,
} from '@/domain/schemas/grades';

/**
 * Plantillas de corte (del docente) y estructuras aplicadas (por materia y
 * grupo). Ninguna de estas llamadas escribe una nota: proponen cómo se van a
 * registrar. La nota sigue entrando por `gradeRepository.save`.
 */
export const gradeTemplateRepository = {
  async list(): Promise<PlantillaNotas[]> {
    const data = await http.get('/grades/plantillas', { schema: itemsResponse(plantillaNotasSchema) });
    return data.items;
  },

  async create(input: PlantillaNotasInput): Promise<PlantillaNotas> {
    return (await http.post('/grades/plantillas', input, { schema: itemResponse(plantillaNotasSchema) })).item;
  },

  async update(id: string, input: Partial<PlantillaNotasInput>): Promise<PlantillaNotas> {
    return (
      await http.patch(`/grades/plantillas/${id}`, input, { schema: itemResponse(plantillaNotasSchema) })
    ).item;
  },

  async remove(id: string): Promise<void> {
    await http.delete(`/grades/plantillas/${id}`, { schema: okResponse });
  },

  /** Todas las estructuras del docente en el periodo. */
  async structures(period: string, subjectId?: string): Promise<EstructuraNotas[]> {
    const data = await http.get('/grades/estructuras', {
      schema: itemsResponse(estructuraNotasSchema),
      query: { period, ...(subjectId ? { subjectId } : {}) },
    });
    return data.items;
  },

  /** La estructura vigente para una materia (y grupo), o null. */
  async current(input: { period: string; subjectId: string; groupId?: string }): Promise<EstructuraNotas | null> {
    const data = await http.get('/grades/estructuras/vigente', {
      schema: z.object({ ok: z.literal(true), item: estructuraNotasSchema.nullable() }),
      query: { period: input.period, subjectId: input.subjectId, ...(input.groupId ? { groupId: input.groupId } : {}) },
    });
    return data.item;
  },

  async apply(input: EstructuraNotasInput): Promise<EstructuraNotas> {
    return (await http.put('/grades/estructuras', input, { schema: itemResponse(estructuraNotasSchema) })).item;
  },

  async removeStructure(id: string): Promise<void> {
    await http.delete(`/grades/estructuras/${id}`, { schema: okResponse });
  },
};
