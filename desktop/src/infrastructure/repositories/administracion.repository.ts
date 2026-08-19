/**
 * Adaptadores HTTP de las capacidades administrativas.
 *
 * Delgados a propósito: traducen argumentos al contrato del endpoint, validan
 * y devuelven tipos de dominio. Cualquier cálculo aquí sería una segunda
 * fuente de verdad compitiendo con el backend.
 */
import { z } from 'zod';
import { http } from '@/core/api/http-client';
import { itemResponse, itemsResponse, okResponse } from '@/domain/schemas/common';
import {
  catalogoAuditoriaSchema,
  detalleAuditoriaSchema,
  errorClienteSchema,
  fotografiaSchema,
  periodoSchema,
  registroAuditoriaSchema,
  resultadoCierreSchema,
  saludSchema,
  type DetalleAuditoria,
  type ErrorCliente,
  type Fotografia,
  type Periodo,
  type RegistroAuditoria,
  type Salud,
} from '@/domain/schemas/administracion';

/** Respuesta paginada: `items` en la raíz, como todo el resto de la API. */
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

// ── Periodos ────────────────────────────────────────────────────────────────

export const periodosRepository = {
  async list(): Promise<Periodo[]> {
    return (await http.get('/periods', { schema: itemsResponse(periodoSchema) })).items;
  },

  async get(period: string): Promise<Periodo> {
    return (await http.get(`/periods/${period}`, { schema: itemResponse(periodoSchema) })).item;
  },

  /**
   * Inicia o retoma el cierre.
   *
   * El tiempo de espera se amplía porque el cierre recorre el semestre entero:
   * con el de por defecto, un periodo grande respondería «tiempo agotado»
   * mientras el servidor sigue trabajando, y quien lo viera concluiría que
   * falló y volvería a pulsar. Volver a pulsar es inofensivo —el cierre es
   * idempotente— pero el mensaje habría mentido.
   */
  async cerrar(period: string) {
    return http.post(`/periods/${period}/cierre`, {}, {
      schema: resultadoCierreSchema,
      timeoutMs: 120_000,
    });
  },

  async abortarCierre(period: string): Promise<Periodo> {
    return (
      await http.post(`/periods/${period}/cierre/abortar`, {}, { schema: itemResponse(periodoSchema) })
    ).item;
  },

  async reabrir(period: string, motivo: string): Promise<Periodo> {
    return (
      await http.post(`/periods/${period}/reapertura`, { motivo }, { schema: itemResponse(periodoSchema) })
    ).item;
  },

  async fotografia(
    period: string,
    filtro?: { subjectId?: string; studentId?: string; page?: number; limit?: number },
  ): Promise<{ items: Fotografia[]; total: number; hasMore: boolean }> {
    const data = await http.get(`/periods/${period}/fotografia`, {
      schema: paginado(fotografiaSchema),
      query: {
        subjectId: filtro?.subjectId,
        studentId: filtro?.studentId,
        page: filtro?.page,
        limit: filtro?.limit,
      },
    });
    return { items: data.items, total: data.total, hasMore: data.hasMore };
  },
};

// ── Auditoría ───────────────────────────────────────────────────────────────

export type FiltroAuditoria = {
  actorId?: string;
  action?: string;
  entity?: string;
  entityId?: string;
  desde?: string;
  hasta?: string;
  q?: string;
  page?: number;
  limit?: number;
};

export const auditRepository = {
  async list(filtro: FiltroAuditoria = {}): Promise<{
    items: RegistroAuditoria[];
    total: number;
    hasMore: boolean;
  }> {
    const data = await http.get('/audit', {
      schema: paginado(registroAuditoriaSchema),
      query: { ...filtro },
    });
    return { items: data.items, total: data.total, hasMore: data.hasMore };
  },

  async get(id: string): Promise<DetalleAuditoria> {
    return (await http.get(`/audit/${id}`, { schema: itemResponse(detalleAuditoriaSchema) })).item;
  },

  async catalogo(): Promise<{ acciones: string[]; entidades: string[] }> {
    const data = await http.get('/audit/catalogo', { schema: catalogoAuditoriaSchema });
    return { acciones: data.acciones, entidades: data.entidades };
  },
};

// ── Centro de salud ─────────────────────────────────────────────────────────

export const healthRepository = {
  async estado(): Promise<Salud> {
    return http.get('/system/health', { schema: saludSchema, timeoutMs: 20_000 });
  },
};

// ── Telemetría ──────────────────────────────────────────────────────────────

export type FiltroErrores = {
  client?: 'desktop' | 'mobile';
  category?: string;
  status?: 'ABIERTO' | 'RESUELTO' | 'IGNORADO';
  appVersion?: string;
  q?: string;
  page?: number;
  limit?: number;
};

export const telemetryRepository = {
  async list(filtro: FiltroErrores = {}): Promise<{ items: ErrorCliente[]; total: number; hasMore: boolean }> {
    const data = await http.get('/telemetry/errores', {
      schema: paginado(errorClienteSchema),
      query: { ...filtro },
    });
    return { items: data.items, total: data.total, hasMore: data.hasMore };
  },

  async setEstado(id: string, estado: 'ABIERTO' | 'RESUELTO' | 'IGNORADO'): Promise<ErrorCliente> {
    return (
      await http.patch(`/telemetry/errores/${id}`, { estado }, { schema: itemResponse(errorClienteSchema) })
    ).item;
  },

  async remove(id: string): Promise<void> {
    await http.delete(`/telemetry/errores/${id}`, { schema: okResponse });
  },

  /**
   * Envía un reporte de error.
   *
   * `anonymous: false` —el usuario sale de la sesión en el servidor, nunca del
   * cuerpo— y sin reintento: un fallo al reportar un fallo no puede convertirse
   * en un bucle. Si no se puede enviar, se pierde y no pasa nada.
   */
  async reportar(entrada: {
    client: 'desktop';
    appVersion?: string;
    platform?: string;
    route?: string;
    category?: string;
    message: string;
    context?: string;
  }): Promise<void> {
    await http.post('/telemetry/errores', entrada, {
      schema: z.object({ ok: z.literal(true) }).passthrough(),
      timeoutMs: 5_000,
    });
  },
};
