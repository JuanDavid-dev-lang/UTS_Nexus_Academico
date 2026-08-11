/**
 * Adaptador HTTP de la agenda y de las preferencias de notificación.
 *
 * Igual que el resto de repositorios: valida la respuesta con zod, así que un
 * cambio de forma en el backend aparece como un error de contrato y no como un
 * calendario medio vacío sin explicación.
 */
import { z } from 'zod';
import { http } from '@/core/api/http-client';
import { itemResponse, itemsResponse, okResponse } from '@/domain/schemas/common';
import {
  agendaResponseSchema,
  agendaResumenSchema,
  calendarEventSchema,
  notificationPreferencesResponse,
  type AgendaItem,
  type AgendaResumen,
  type CalendarEvent,
  type CalendarEventInput,
  type NotificationPreferences,
} from '@/domain/schemas/agenda';
import type { AgendaRepository, NotificationPreferencesRepository } from '@/domain/repositories/ports';

const eventosResponse = itemsResponse(calendarEventSchema);
const eventoResponse = itemResponse(calendarEventSchema);

export const agendaRepository: AgendaRepository = {
  async range(input): Promise<{ items: AgendaItem[]; campusOffsetMinutes: number }> {
    const data = await http.get('/agenda', {
      schema: agendaResponseSchema,
      query: {
        from: input.desde.toISOString(),
        to: input.hasta.toISOString(),
        subjectId: input.subjectId,
        groupId: input.groupId,
        tipos: input.tipos?.join(','),
      },
    });
    return { items: data.items, campusOffsetMinutes: data.campusOffsetMinutes };
  },

  async summary(): Promise<AgendaResumen> {
    return http.get('/agenda/resumen', { schema: agendaResumenSchema });
  },

  async listEvents(desde: Date, hasta: Date): Promise<CalendarEvent[]> {
    const data = await http.get('/agenda/events', {
      schema: eventosResponse,
      query: { from: desde.toISOString(), to: hasta.toISOString() },
    });
    return data.items;
  },

  async createEvent(input: CalendarEventInput): Promise<CalendarEvent> {
    return (await http.post('/agenda/events', input, { schema: eventoResponse })).item;
  },

  async updateEvent(id: string, input: Partial<CalendarEventInput>): Promise<CalendarEvent> {
    return (await http.patch(`/agenda/events/${id}`, input, { schema: eventoResponse })).item;
  },

  async removeEvent(id: string): Promise<void> {
    await http.delete(`/agenda/events/${id}`, { schema: okResponse });
  },
};

export const notificationPreferencesRepository: NotificationPreferencesRepository = {
  async get(): Promise<{ preferences: NotificationPreferences; pushConfigurado: boolean }> {
    const data = await http.get('/notifications/preferences', { schema: notificationPreferencesResponse });
    return { preferences: data.preferences, pushConfigurado: data.pushConfigurado };
  },

  async update(input): Promise<{ preferences: NotificationPreferences; pushConfigurado: boolean }> {
    const data = await http.put('/notifications/preferences', input, {
      schema: notificationPreferencesResponse,
    });
    return { preferences: data.preferences, pushConfigurado: data.pushConfigurado };
  },

  async markAllRead(): Promise<number> {
    const data = await http.patch('/notifications/read-all', undefined, {
      schema: z.object({ ok: z.literal(true), count: z.number().optional().default(0) }),
    });
    return data.count;
  },

  async remove(id: string): Promise<void> {
    await http.delete(`/notifications/${id}`, { schema: okResponse });
  },
};
