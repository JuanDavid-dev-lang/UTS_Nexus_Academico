import {
  CutNumber,
  EscaneoNotas,
  GradeInput,
  GradeRepository,
  Scope,
  consolidatedResponseSchema,
  escaneoNotasSchema,
  gradeResponse,
  gradesResponse,
  http,
  okResponse,
  pendingResponseSchema,
  scopeToQuery,
  z,
} from './academic-base';

export const gradeRepository: GradeRepository = {
  async list(scope: Scope) {
    const data = await http.get('/grades', {
      schema: gradesResponse,
      query: scopeToQuery(scope),
    });
    return data.items;
  },

  async consolidated(scope: Scope & { period: string }) {
    const data = await http.get('/grades/consolidado', {
      schema: consolidatedResponseSchema,
      query: scopeToQuery(scope),
    });
    return data.items;
  },

  async pending(period: string, subjectId?: string) {
    const data = await http.get('/grades/pendientes', {
      schema: pendingResponseSchema,
      query: { period, ...(subjectId ? { subjectId } : {}) },
    });
    return data.items;
  },

  async save(input: GradeInput) {
    return (await http.post('/grades', input, { schema: gradeResponse })).item;
  },

  async remove(id: string) {
    await http.delete(`/grades/${id}`, { schema: okResponse });
  },
};

/**
 * Importación de calificaciones en dos pasos.
 *
 * Aparte del `gradeRepository` por la misma razón que el escáner de
 * asistencia: primero se propone, luego una persona revisa, y solo entonces se
 * escribe. Mezclarlo con el alta directa invitaría a saltarse la revisión.
 */
export const gradeImportRepository = {
  /** Sube el archivo (.xlsx, PDF o foto) y devuelve la propuesta cruzada con la matrícula. */
  async scan(input: { groupId: string; archivo: File }): Promise<EscaneoNotas> {
    const formulario = new FormData();
    formulario.append('groupId', input.groupId);
    formulario.append('file', input.archivo);
    return http.post('/grades/import/scan', formulario, {
      schema: escaneoNotasSchema,
      // Interpretar una foto tarda mucho más que una consulta normal.
      timeoutMs: 90_000,
    });
  },

  /** Escribe lo ya revisado. Devuelve cuántas notas creó y cuántas SOBRESCRIBIÓ. */
  async bulk(input: {
    groupId: string;
    corte: CutNumber;
    componentType: 'TRABAJOS' | 'PARCIALES' | 'AUTOEVALUACION';
    labels: string[];
    filas: { studentId: string; scores: (number | null)[] }[];
  }): Promise<{ creadas: number; actualizadas: number; omitidas: number }> {
    return http.post('/grades/bulk', input, {
      schema: z.object({
        ok: z.literal(true),
        creadas: z.number(),
        actualizadas: z.number(),
        omitidas: z.number(),
      }),
    });
  },
};
