/**
 * HTTP adapters for the academic ports.
 *
 * Thin by design: map arguments to the endpoint contract, validate, return
 * domain types. Any calculation here would be a second source of truth
 * competing with the backend's grading engine.
 */
import { z } from 'zod';
import { http, request } from '@/core/api/http-client';
import { itemResponse, itemsResponse, okResponse } from '@/domain/schemas/common';
import {
  attendanceSchema,
  attendanceSummarySchema,
  consolidatedResponseSchema,
  pendingResponseSchema,
  enrollmentSchema,
  gradeSchema,
  groupSchema,
  avisoSchema,
  feedbackSchema,
  enlacesDescargaSchema,
  catalogoSchema,
  escaneoNotasSchema,
  escaneoPlanillaSchema,
  profesorAdminSchema,
  solicitudSchema,
  studentDirectoryEntrySchema,
  thesisFormatSchema,
  studentSchema,
  subjectSchema,
  type GradeInput,
  type Aviso,
  type AvisoInput,
  type EstadoFeedback,
  type Feedback,
  type FeedbackInput,
  type TipoFeedback,
  type EnlacesDescarga,
  type Catalogo,
  type CutNumber,
  type EscaneoNotas,
  type EscaneoPlanilla,
  type SolicitudRegistro,
  type Solicitud,
  type EtapaTrabajoGrado,
  type ProfesorAdmin,
  type RosterRow,
  type StudentInput,
  type SubjectInput,
  type ThesisFormat,
} from '@/domain/schemas/academic';
import type {
  AttendanceRepository,
  EnrollmentRepository,
  GradeRepository,
  GroupRepository,
  Scope,
  StudentRepository,
  SubjectRepository,
} from '@/domain/repositories/ports';

const studentsResponse = itemsResponse(studentSchema);
const studentResponse = itemResponse(studentSchema);
const subjectsResponse = itemsResponse(subjectSchema);
const subjectResponse = itemResponse(subjectSchema);
const groupsResponse = itemsResponse(groupSchema);
const gradesResponse = itemsResponse(gradeSchema);
const gradeResponse = itemResponse(gradeSchema);
const attendanceResponse = itemsResponse(attendanceSchema);
const attendanceItemResponse = itemResponse(attendanceSchema);
const enrollmentsResponse = itemsResponse(enrollmentSchema);
const enrollmentResponse = itemResponse(enrollmentSchema);
const directoryResponse = itemsResponse(studentDirectoryEntrySchema);
const importResponse = z.object({ ok: z.literal(true), count: z.number() });

/**
 * Propuesta de listado leído de un PDF o una foto.
 *
 * Cada fila trae su confianza porque no todas valen lo mismo: un PDF con capa
 * de texto llega en 1.0 —no hubo reconocimiento que pueda fallar— y una foto
 * llega con lo que el OCR crea. Esa diferencia es la que decide qué revisar.
 */
const rosterScanResponse = z.object({
  ok: z.literal(true),
  origen: z.string(),
  avisos: z.array(z.string()).default([]),
  filas: z.array(
    z.object({
      code: z.string(),
      fullName: z.string(),
      email: z.string().optional(),
      program: z.string().optional(),
      confianza: z.number(),
      avisos: z.array(z.string()).default([]),
    }),
  ),
});

function scopeToQuery(scope: Scope): Record<string, string | undefined> {
  return {
    period: scope.period,
    subjectId: scope.subjectId,
    groupId: scope.groupId,
    studentId: scope.studentId,
  };
}

export const studentRepository: StudentRepository = {
  async list(scope?: Scope & { q?: string }) {
    const data = await http.get('/students', {
      schema: studentsResponse,
      query: scope ? { ...scopeToQuery(scope), q: scope.q } : undefined,
    });
    return data.items;
  },

  async search(q: string) {
    // El backend exige tres caracteres; cortar aquí evita el viaje y el 400.
    if (q.trim().length < 3) return [];
    const data = await http.get('/students/search', {
      schema: directoryResponse,
      query: { q: q.trim() },
    });
    return data.items;
  },

  async create(input: StudentInput) {
    return (await http.post('/students', input, { schema: studentResponse })).item;
  },

  async update(id: string, input: Partial<StudentInput>) {
    return (await http.patch(`/students/${id}`, input, { schema: studentResponse })).item;
  },

  async remove(id: string) {
    await http.delete(`/students/${id}`, { schema: okResponse });
  },

  async createMany(input: StudentInput[]) {
    const data = await http.post('/students/bulk', input, { schema: studentsResponse });
    return data.items.length;
  },
};

export const subjectRepository: SubjectRepository = {
  async list() {
    return (await http.get('/subjects', { schema: subjectsResponse })).items;
  },

  async create(input: SubjectInput & { professorId: string }) {
    return (await http.post('/subjects', input, { schema: subjectResponse })).item;
  },

  async update(id: string, input: Partial<SubjectInput>) {
    return (await http.patch(`/subjects/${id}`, input, { schema: subjectResponse })).item;
  },

  async remove(id: string) {
    await http.delete(`/subjects/${id}`, { schema: okResponse });
  },
};

export const groupRepository: GroupRepository = {
  async list() {
    return (await http.get('/groups', { schema: groupsResponse })).items;
  },
};

export const enrollmentRepository: EnrollmentRepository = {
  async list(scope: Scope) {
    const data = await http.get('/enrollments', {
      schema: enrollmentsResponse,
      query: scopeToQuery(scope),
    });
    return data.items;
  },

  async enroll(input: { studentId: string; groupId: string }) {
    return (await http.post('/enrollments', input, { schema: enrollmentResponse })).item;
  },

  async importRoster(input: { groupId: string; students: RosterRow[] }) {
    const data = await http.post('/enrollments/bulk', input, { schema: importResponse });
    return data.count;
  },

  /**
   * Lee un listado desde un PDF o una foto. Solo PROPONE.
   *
   * La escritura sigue siendo `importRoster`, con lo que el docente revisó: una
   * cédula mal reconocida no da error, crea un estudiante que no existe y lo
   * matricula.
   */
  async scanRoster(groupId: string, file: File) {
    const body = new FormData();
    body.append('groupId', groupId);
    body.append('file', file);
    return request('/enrollments/import/scan', {
      method: 'POST',
      body,
      schema: rosterScanResponse,
      // El reconocimiento de una hoja tarda: el tiempo normal de petición se
      // queda corto y cortaría una lectura que iba bien.
      timeoutMs: 90_000,
    });
  },

  async remove(id: string) {
    await http.delete(`/enrollments/${id}`, { schema: okResponse });
  },
};

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

  async setDirector(id: string, esDirector: boolean): Promise<ProfesorAdmin> {
    const data = await http.patch(`/professors/${id}`, { esDirectorTrabajoGrado: esDirector }, {
      schema: itemResponse(profesorAdminSchema),
    });
    return data.item;
  },
};

/** Repositorio de formatos oficiales de trabajo de grado. */
export const thesisRepository = {
  async list(filtro?: { etapa?: EtapaTrabajoGrado; q?: string }): Promise<ThesisFormat[]> {
    const data = await http.get('/trabajos-grado/formatos', {
      schema: itemsResponse(thesisFormatSchema),
      query: { etapa: filtro?.etapa, q: filtro?.q },
    });
    return data.items;
  },

  /** Descarga autenticada; los formatos NO están en el estático público. */
  async download(id: string): Promise<Blob> {
    return http.blob(`/trabajos-grado/formatos/${id}/archivo`);
  },

  async upload(input: {
    archivo: File;
    nombre: string;
    descripcion: string;
    etapa: EtapaTrabajoGrado;
    camposALlenar: string[];
    version: string;
  }): Promise<ThesisFormat> {
    const formulario = new FormData();
    formulario.append('file', input.archivo);
    formulario.append('nombre', input.nombre);
    formulario.append('descripcion', input.descripcion);
    formulario.append('etapa', input.etapa);
    formulario.append('camposALlenar', JSON.stringify(input.camposALlenar));
    formulario.append('version', input.version);
    const data = await http.post('/trabajos-grado/formatos', formulario, {
      schema: itemResponse(thesisFormatSchema),
    });
    return data.item;
  },

  async remove(id: string): Promise<void> {
    await http.delete(`/trabajos-grado/formatos/${id}`, { schema: okResponse });
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

export const avisoRepository = {
  async list(): Promise<{ items: Aviso[]; sinLeer: number }> {
    return http.get('/avisos', {
      schema: z.object({
        ok: z.literal(true),
        items: z.array(avisoSchema),
        sinLeer: z.number(),
      }),
    });
  },

  async create(input: AvisoInput): Promise<Aviso> {
    return (await http.post('/avisos', input, { schema: itemResponse(avisoSchema) })).item;
  },

  /** Cuántos docentes recibirían un aviso con este alcance, antes de publicarlo. */
  async destinatarios(
    alcance: Pick<AvisoInput, 'sedes' | 'facultades' | 'programas'>,
  ): Promise<{ alcanzados: number; total: number }> {
    return http.post('/avisos/destinatarios', alcance, {
      schema: z.object({ ok: z.literal(true), alcanzados: z.number(), total: z.number() }),
    });
  },

  async marcarLeido(id: string): Promise<void> {
    await http.post(`/avisos/${id}/leido`, undefined, { schema: okResponse });
  },

  async remove(id: string): Promise<void> {
    await http.delete(`/avisos/${id}`, { schema: okResponse });
  },
};

/**
 * Buzón de sugerencias de la aplicación.
 *
 * El docente escribe y ve solo lo suyo; la administración ve todo y cambia el
 * estado. El servidor decide qué devuelve según el rol — aquí no se filtra.
 */
export const feedbackRepository = {
  async list(filtro?: { estado?: EstadoFeedback; tipo?: TipoFeedback }): Promise<Feedback[]> {
    const data = await http.get('/feedback', {
      schema: itemsResponse(feedbackSchema),
      query: { estado: filtro?.estado, tipo: filtro?.tipo },
    });
    return data.items;
  },

  async create(input: FeedbackInput & { origen?: string; appVersion?: string }): Promise<Feedback> {
    return (await http.post('/feedback', input, { schema: itemResponse(feedbackSchema) })).item;
  },

  async setEstado(id: string, estado: EstadoFeedback): Promise<Feedback> {
    return (await http.patch(`/feedback/${id}`, { estado }, { schema: itemResponse(feedbackSchema) })).item;
  },

  async remove(id: string): Promise<void> {
    await http.delete(`/feedback/${id}`, { schema: okResponse });
  },
};

/**
 * Enlaces de la página pública de descargas.
 *
 * Viven en el servidor, no en el HTML del sitio, para que publicar una versión
 * no obligue a editar y desplegar la página.
 */
const respuestaEnlaces = z.object({ ok: z.literal(true), enlaces: enlacesDescargaSchema });

export const descargaRepository = {
  async get(): Promise<EnlacesDescarga> {
    return (await http.get('/descargas', { schema: respuestaEnlaces })).enlaces;
  },

  async save(enlaces: EnlacesDescarga): Promise<EnlacesDescarga> {
    return (await http.put('/descargas', enlaces, { schema: respuestaEnlaces })).enlaces;
  },
};
