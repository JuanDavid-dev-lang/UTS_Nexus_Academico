/**
 * Adaptadores HTTP de actividades, casos de inasistencia e historial.
 *
 * El estado visible de una actividad (`OPEN` / `CLOSED` / `LATE`) llega ya
 * resuelto del servidor: aquí no se compara ninguna fecha.
 */
import { z } from 'zod';
import { http } from '@/core/api/http-client';
import { itemResponse, okResponse } from '@/domain/schemas/common';
import {
  actividadSchema,
  casoAsistenciaSchema,
  type Actividad,
  type ActividadInput,
  type CasoAsistencia,
  type EstadoActividad,
} from '@/domain/schemas/activities';
import { eventoHistorialSchema, expedienteSeguimientoSchema, type EventoHistorial, type ExpedienteSeguimiento } from '@/domain/schemas/timeline';

function paginado<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    ok: z.literal(true),
    items: z.array(item),
    total: z.number().default(0),
    page: z.number().default(1),
    limit: z.number().default(100),
    hasMore: z.boolean().default(false),
  });
}

export type FiltroActividades = {
  subjectId?: string;
  groupId?: string;
  period?: string;
  estado?: EstadoActividad;
  desde?: string;
  hasta?: string;
  q?: string;
  page?: number;
  limit?: number;
};

export const activitiesRepository = {
  async list(filtro: FiltroActividades = {}): Promise<{ items: Actividad[]; total: number; hasMore: boolean }> {
    const data = await http.get('/activities', {
      schema: paginado(actividadSchema),
      query: { ...filtro },
    });
    return { items: data.items, total: data.total, hasMore: data.hasMore };
  },

  async get(id: string): Promise<Actividad> {
    return (await http.get(`/activities/${id}`, { schema: itemResponse(actividadSchema) })).item;
  },

  async create(entrada: ActividadInput): Promise<Actividad> {
    return (await http.post('/activities', normalizar(entrada), { schema: itemResponse(actividadSchema) }))
      .item;
  },

  async update(id: string, cambio: Partial<ActividadInput>): Promise<Actividad> {
    return (
      await http.patch(`/activities/${id}`, normalizar(cambio), { schema: itemResponse(actividadSchema) })
    ).item;
  },

  async cerrar(id: string): Promise<Actividad> {
    return (await http.post(`/activities/${id}/cierre`, {}, { schema: itemResponse(actividadSchema) })).item;
  },

  async reabrir(id: string): Promise<Actividad> {
    return (await http.post(`/activities/${id}/reapertura`, {}, { schema: itemResponse(actividadSchema) }))
      .item;
  },

  async remove(id: string): Promise<void> {
    await http.delete(`/activities/${id}`, { schema: okResponse });
  },
};

/**
 * Quita lo que el backend rechazaría.
 *
 * Un `attachmentUrl` vacío no es una URL: el formulario deja el campo en `''`
 * cuando no hay adjunto, y mandarlo tal cual produce un 400 sobre un campo que
 * la persona ni siquiera rellenó.
 */
function normalizar<T extends Record<string, unknown>>(entrada: T): Record<string, unknown> {
  const salida: Record<string, unknown> = { ...entrada };
  if (!salida.attachmentUrl) delete salida.attachmentUrl;
  if (!salida.groupId) delete salida.groupId;
  if (!salida.period) delete salida.period;
  return salida;
}

// ── Casos de patrón de inasistencia ─────────────────────────────────────────

export const attendanceCasesRepository = {
  async list(filtro: {
    studentId?: string;
    subjectId?: string;
    period?: string;
    status?: string;
    page?: number;
    limit?: number;
  } = {}): Promise<{ items: CasoAsistencia[]; total: number; hasMore: boolean }> {
    const data = await http.get('/attendance/casos', {
      schema: paginado(casoAsistenciaSchema),
      query: { ...filtro },
    });
    return { items: data.items, total: data.total, hasMore: data.hasMore };
  },

  async intervenir(
    id: string,
    entrada: { nota: string; estado: 'EN_SEGUIMIENTO' | 'RESUELTO' | 'DESCARTADO' },
  ): Promise<CasoAsistencia> {
    return (
      await http.post(`/attendance/casos/${id}/intervencion`, entrada, {
        schema: itemResponse(casoAsistenciaSchema),
      })
    ).item;
  },
};

// ── Historial del estudiante ────────────────────────────────────────────────

export const timelineRepository = {
  async seguimiento(studentId: string, filtro: { period?: string; subjectId?: string; page?: number; limit?: number } = {}): Promise<ExpedienteSeguimiento> {
    return (await http.get(`/students/${studentId}/seguimiento`, {
      schema: itemResponse(expedienteSeguimientoSchema), query: filtro,
    })).item;
  },
  async historial(
    studentId: string,
    filtro: { period?: string; tipos?: string[]; page?: number; limit?: number } = {},
  ): Promise<{ items: EventoHistorial[]; total: number; hasMore: boolean }> {
    const data = await http.get(`/students/${studentId}/historial`, {
      schema: paginado(eventoHistorialSchema),
      query: {
        period: filtro.period,
        // El backend espera una lista separada por comas; un solo formato
        // evita que cada cliente elija el suyo.
        tipos: filtro.tipos?.length ? filtro.tipos.join(',') : undefined,
        page: filtro.page,
        limit: filtro.limit,
      },
    });
    return { items: data.items, total: data.total, hasMore: data.hasMore };
  },
};
