import { http } from '@/core/api/http-client';
import {
  aperturaQrResponse,
  qrVigenteSchema,
  sesionQrResponse,
  sesionesAbiertasQrResponse,
  type QrVigente,
  type SesionQr,
} from '@/domain/schemas/attendance-qr';

/**
 * Adaptador de la asistencia por QR.
 *
 * Ninguna llamada manda una marca ni una fecha: el QR es para la clase que está
 * ocurriendo, y lo que cada estudiante marca llega al servidor por UniPlanner,
 * no por aquí.
 */
export const attendanceQrRepository = {
  async abiertas(subjectId: string): Promise<{ id: string; subjectId: string; groupId: string | null }[]> {
    const data = await http.get('/asistencia-qr/sesiones', {
      schema: sesionesAbiertasQrResponse,
      query: { subjectId },
    });
    return data.items;
  },

  async abrir(input: {
    subjectId: string;
    /** El grupo al que se pasa lista: obligatorio, como en el servidor. */
    groupId: string;
    minutos: number;
    marcarAusentes: boolean;
  }): Promise<{ existente: boolean; sesion: SesionQr }> {
    const data = await http.post('/asistencia-qr/sesiones', input, { schema: aperturaQrResponse });
    return { existente: data.existente, sesion: data.item };
  },

  async sesion(id: string): Promise<SesionQr> {
    return (await http.get(`/asistencia-qr/sesiones/${id}`, { schema: sesionQrResponse })).item;
  },

  async qr(id: string): Promise<QrVigente> {
    return http.get(`/asistencia-qr/sesiones/${id}/qr`, { schema: qrVigenteSchema });
  },

  async cerrar(id: string): Promise<SesionQr> {
    return (await http.post(`/asistencia-qr/sesiones/${id}/cerrar`, {}, { schema: sesionQrResponse })).item;
  },
};
