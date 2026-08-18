import {
  AttendanceRepository,
  EscaneoPlanilla,
  Scope,
  attendanceItemResponse,
  attendanceResponse,
  attendanceSummarySchema,
  escaneoPlanillaSchema,
  http,
  scopeToQuery,
  z,
} from './academic-base';

export const attendanceRepository: AttendanceRepository = {
  async list(scope: Scope) {
    const data = await http.get('/attendance', {
      schema: attendanceResponse,
      query: scopeToQuery(scope),
    });
    return data.items;
  },

  async mark(input) {
    return (await http.post('/attendance', input, { schema: attendanceItemResponse })).item;
  },

  async summaryFor(studentId: string) {
    const data = await http.get(`/attendance/summary/${studentId}`, {
      schema: attendanceSummarySchema,
    });
    return {
      totalClasses: data.summary.totalClasses,
      misses: data.summary.misses,
      attendanceRate: data.summary.attendanceRate,
    };
  },
};

/**
 * Escaneo de planillas de asistencia.
 *
 * Se mantiene aparte del `attendanceRepository` porque el flujo es distinto:
 * primero se propone y después se confirma, y entre ambos pasos hay una persona
 * revisando. Mezclarlo con el registro directo invitaría a saltarse ese paso.
 */

export const attendanceScanRepository = {
  /** Sube la foto y devuelve la propuesta. No guarda nada. */
  async escanear(input: { groupId: string; archivo: File }): Promise<EscaneoPlanilla> {
    const formulario = new FormData();
    formulario.append('groupId', input.groupId);
    formulario.append('file', input.archivo);
    return http.post('/attendance/scan', formulario, {
      schema: escaneoPlanillaSchema,
      // Interpretar una foto tarda mucho más que una consulta normal.
      timeoutMs: 90_000,
    });
  },

  /** Guarda lo ya revisado. Devuelve cuántos registros se escribieron. */
  async confirmar(input: {
    groupId: string;
    fechas: string[];
    durationMinutes: number;
    filas: { studentId: string; presentes: boolean[] }[];
  }): Promise<{ guardados: number; clases: number; estudiantes: number }> {
    return http.post('/attendance/scan/confirm', input, {
      schema: z.object({
        ok: z.literal(true),
        guardados: z.number(),
        clases: z.number(),
        estudiantes: z.number(),
      }),
    });
  },
};

/**
 * Importación de calificaciones en dos pasos.
 *
 * Aparte del `gradeRepository` por la misma razón que el escáner de
 * asistencia: primero se propone, luego una persona revisa, y solo entonces se
 * escribe. Mezclarlo con el alta directa invitaría a saltarse la revisión.
 */
