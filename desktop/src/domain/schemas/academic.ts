/**
 * Academic entities: students, subjects, groups, grades and attendance.
 *
 * Grade arithmetic is NOT reproduced here. The backend owns the canonical
 * engine (30/60/10 per component, 33/33/34 per cut) in
 * `domains/grading/grading.service.ts`; duplicating it in the client is how the
 * two drift apart and start disagreeing about who passed.
 */
import { z } from 'zod';
import { mongoDoc, numberish, objectId, riskLevel } from './common';

// ── Students ────────────────────────────────────────────────────────────────
export const studentSchema = mongoDoc.extend({
  code: z.string(),
  fullName: z.string(),
  email: z.string().optional().default(''),
  program: z.string().optional().default(''),
  photoUrl: z.string().nullable().optional(),
});
export type Student = z.infer<typeof studentSchema>;

/**
 * Resultado del directorio global (`GET /students/search`).
 *
 * Deliberadamente más pobre que `studentSchema`: para matricular basta la
 * identidad, y un buscador que además devolviera notas o riesgo expondría el
 * expediente de estudiantes que aún no son de quien busca.
 */
export const studentDirectoryEntrySchema = mongoDoc.extend({
  code: z.string(),
  fullName: z.string(),
  program: z.string().optional().default(''),
  photoUrl: z.string().nullable().optional(),
});
export type StudentDirectoryEntry = z.infer<typeof studentDirectoryEntrySchema>;

/** Fila de una lista importada: lo mínimo que el backend necesita para matricular. */
export const rosterRowSchema = z.object({
  code: z.string().min(3, 'Cédula demasiado corta'),
  fullName: z.string().min(3, 'Nombre demasiado corto'),
  email: z.string().email('Correo inválido').optional(),
  program: z.string().optional(),
});
export type RosterRow = z.infer<typeof rosterRowSchema>;

export const studentInputSchema = z.object({
  code: z.string().min(3, 'Mínimo 3 caracteres'),
  fullName: z.string().min(3, 'Nombre demasiado corto'),
  email: z.string().email('Correo inválido'),
  program: z.string().min(2, 'Indica el programa'),
});
export type StudentInput = z.infer<typeof studentInputSchema>;

// ── Subjects ────────────────────────────────────────────────────────────────
export const subjectSchema = mongoDoc.extend({
  name: z.string(),
  code: z.string(),
  period: z.string(),
  credits: numberish.optional().default(0),
  professorId: objectId.optional(),
});
export type Subject = z.infer<typeof subjectSchema>;

export const subjectInputSchema = z.object({
  name: z.string().min(3, 'Nombre demasiado corto'),
  code: z.string().min(2, 'Código demasiado corto'),
  period: z.string().min(4, 'Formato: 2026-1'),
  credits: z.number().int().min(0).max(20),
});
export type SubjectInput = z.infer<typeof subjectInputSchema>;

// ── Groups ──────────────────────────────────────────────────────────────────
export const groupSchema = mongoDoc.extend({
  name: z.string(),
  subjectId: objectId.optional(),
  period: z.string().optional(),
});
export type Group = z.infer<typeof groupSchema>;

// ── Grades ──────────────────────────────────────────────────────────────────
export const componentType = z.enum(['TRABAJOS', 'PARCIALES', 'AUTOEVALUACION']);
export type ComponentType = z.infer<typeof componentType>;

export const cutNumber = z.union([z.literal(1), z.literal(2), z.literal(3)]);
export type CutNumber = z.infer<typeof cutNumber>;

export const gradeSchema = mongoDoc.extend({
  studentId: objectId,
  subjectId: objectId,
  groupId: objectId.optional().nullable(),
  teacherId: objectId.optional(),
  corte: numberish,
  componentType: componentType.optional(),
  label: z.string().optional().default('Nota'),
  score: numberish,
  maxScore: numberish.optional().default(5),
  period: z.string().optional().default(''),
});
export type Grade = z.infer<typeof gradeSchema>;

export const gradeInputSchema = z.object({
  studentId: objectId,
  subjectId: objectId,
  groupId: objectId.optional(),
  teacherId: objectId,
  corte: cutNumber,
  componentType,
  label: z.string().min(1).default('Nota'),
  score: z.number().min(0, 'Mínimo 0.0').max(5, 'Máximo 5.0'),
  period: z.string().min(4),
});
export type GradeInput = z.infer<typeof gradeInputSchema>;

/** Una nota concreta dentro de un componente, con el motivo que le puso el docente. */
export const gradeDetailSchema = z.object({
  id: z.string(),
  label: z.string(),
  score: numberish,
});
export type GradeDetail = z.infer<typeof gradeDetailSchema>;

/** Per-component breakdown returned by the canonical grading engine. */
export const componentSummarySchema = z.object({
  tipo: componentType,
  peso: numberish,
  promedio: numberish,
  registros: numberish,
  aporte: numberish,
  /*
   * Las notas que produjeron el promedio. Opcional con defecto vacío porque un
   * servidor anterior a este campo sigue respondiendo sin él: el consolidado se
   * vería sin desglose, no fallaría el contrato.
   */
  notas: z.array(gradeDetailSchema).optional().default([]),
});

export const cutSummarySchema = z.object({
  corte: numberish,
  peso: numberish,
  nota: numberish,
  aporteFinal: numberish,
  completo: z.boolean(),
  componentes: z.array(componentSummarySchema),
});

export const consolidatedRowSchema = z.object({
  studentId: objectId,
  code: z.string(),
  fullName: z.string(),
  notaFinal: numberish,
  aprobado: z.boolean(),
  /** True only when all three cuts have all three components graded. */
  completo: z.boolean(),
  cortes: z.array(cutSummarySchema).optional().default([]),
});
export type ConsolidatedRow = z.infer<typeof consolidatedRowSchema>;

export const consolidatedResponseSchema = z.object({
  ok: z.literal(true),
  period: z.string(),
  items: z.array(consolidatedRowSchema),
});

/**
 * Lo que falta por calificar, por materia y corte.
 *
 * Se cuenta sobre los matriculados, no sobre quien ya tiene alguna nota: el
 * estudiante sin ninguna es justo el que no puede faltar de esta cuenta.
 */
export const pendingComponentSchema = z.object({
  componente: componentType,
  faltan: numberish,
  total: numberish,
});

export const pendingCutSchema = z.object({
  corte: numberish,
  faltan: numberish,
  componentes: z.array(pendingComponentSchema),
});

export const pendingSubjectSchema = z.object({
  subjectId: objectId,
  name: z.string(),
  code: z.string(),
  matriculados: numberish,
  faltan: numberish,
  cortes: z.array(pendingCutSchema),
});
export type PendingSubject = z.infer<typeof pendingSubjectSchema>;

export const pendingResponseSchema = z.object({
  ok: z.literal(true),
  period: z.string(),
  items: z.array(pendingSubjectSchema),
});

// ── Attendance ──────────────────────────────────────────────────────────────
export const attendanceSchema = mongoDoc.extend({
  studentId: objectId,
  subjectId: objectId,
  groupId: objectId.optional().nullable(),
  teacherId: objectId.optional(),
  period: z.string().optional().default(''),
  date: z.string(),
  durationMinutes: numberish.optional().default(90),
  present: z.boolean(),
  notes: z.string().optional().default(''),
});
export type Attendance = z.infer<typeof attendanceSchema>;

export const attendanceSummarySchema = z.object({
  ok: z.literal(true),
  summary: z.object({
    totalClasses: numberish,
    misses: numberish,
    totalMinutes: numberish,
    presentMinutes: numberish,
    attendanceRate: numberish,
  }),
});

// ── Enrollments ─────────────────────────────────────────────────────────────
export const enrollmentSchema = mongoDoc.extend({
  studentId: objectId,
  subjectId: objectId,
  groupId: objectId.optional().nullable(),
  period: z.string().optional().default(''),
});
export type Enrollment = z.infer<typeof enrollmentSchema>;

// ── Risk ────────────────────────────────────────────────────────────────────
export const riskItemSchema = z.object({
  studentId: objectId,
  code: z.string(),
  fullName: z.string(),
  subjectId: objectId,
  notaFinal: numberish,
  attendanceRate: numberish,
  missed: numberish,
  riskScore: numberish,
  level: riskLevel,
  motivos: z.array(z.string()).optional().default([]),
});
export type RiskItem = z.infer<typeof riskItemSchema>;

export const riskResponseSchema = z.object({
  ok: z.literal(true),
  items: z.array(riskItemSchema),
});

// ── Escaneo de planillas de asistencia ──────────────────────────────────────

/** Qué tan segura es la atribución de una fila leída a un estudiante. */
export const nivelCoincidencia = z.enum(['exacta', 'probable', 'dudosa', 'sin-coincidencia']);
export type NivelCoincidencia = z.infer<typeof nivelCoincidencia>;

export const celdaEscaneadaSchema = z.object({
  columna: z.number().int(),
  presente: z.boolean(),
  dudosa: z.boolean(),
});

export const filaEscaneadaSchema = z.object({
  indice: z.number().int(),
  cedulaLeida: z.string(),
  nombreLeido: z.string(),
  studentId: z.string().nullable(),
  code: z.string().nullable(),
  fullName: z.string().nullable(),
  nivel: nivelCoincidencia,
  avisos: z.array(z.string()),
  celdas: z.array(celdaEscaneadaSchema),
});
export type FilaEscaneada = z.infer<typeof filaEscaneadaSchema>;

export const matriculadoSchema = z.object({
  id: z.string(),
  code: z.string(),
  fullName: z.string(),
});
export type Matriculado = z.infer<typeof matriculadoSchema>;

/** Propuesta de lectura. Nada de esto está guardado todavía. */
export const escaneoPlanillaSchema = z.object({
  ok: z.literal(true),
  groupId: z.string(),
  subjectId: z.string(),
  period: z.string(),
  columnasFecha: z.number().int(),
  /** Una por columna, leida de la cabecera. `null` donde no se pudo. */
  fechasSugeridas: z.array(z.string().nullable()).default([]),
  avisos: z.array(z.string()),
  filas: z.array(filaEscaneadaSchema),
  ausentesDeLaFoto: z.array(matriculadoSchema),
  matriculados: z.array(matriculadoSchema),
});
export type EscaneoPlanilla = z.infer<typeof escaneoPlanillaSchema>;

// ── Catálogo institucional y registro de docentes ───────────────────────────

export const sedeId = z.enum(['BUCARAMANGA', 'PIEDECUESTA', 'VELEZ', 'BARRANCABERMEJA']);
export const facultadId = z.enum(['SOCIOECONOMICAS', 'NATURALES_INGENIERIAS']);
export const nivelId = z.enum(['TECNOLOGICO', 'PROFESIONAL']);

export type SedeId = z.infer<typeof sedeId>;
export type FacultadId = z.infer<typeof facultadId>;
export type NivelId = z.infer<typeof nivelId>;

export const programaSchema = z.object({
  id: z.string(),
  nombre: z.string(),
  facultad: facultadId,
  nivel: nivelId,
});
export type Programa = z.infer<typeof programaSchema>;

const opcion = z.object({ id: z.string(), nombre: z.string() });

/** Lo que necesita el formulario de registro. Se sirve sin autenticación. */
export const catalogoSchema = z.object({
  ok: z.literal(true),
  abierto: z.boolean(),
  sedes: z.array(opcion),
  facultades: z.array(opcion),
  niveles: z.array(opcion),
  programas: z.array(programaSchema),
});
export type Catalogo = z.infer<typeof catalogoSchema>;

export const solicitudRegistroSchema = z.object({
  cedula: z.string().regex(/^\d{6,10}$/, 'La cédula debe tener entre 6 y 10 dígitos'),
  nombres: z.string().min(2, 'Escribe tus nombres'),
  apellidos: z.string().min(2, 'Escribe tus apellidos'),
  sede: sedeId,
  facultad: facultadId,
  niveles: z.array(nivelId).min(1, 'Marca al menos un nivel'),
  programas: z.array(z.string()).min(1, 'Elige al menos un programa'),
  email: z.string().email('Correo inválido'),
  password: z
    .string()
    .min(10, 'Mínimo 10 caracteres')
    .regex(/[a-z]/, 'Incluye una minúscula')
    .regex(/[A-Z]/, 'Incluye una mayúscula')
    .regex(/\d/, 'Incluye un número'),
});
export type SolicitudRegistro = z.infer<typeof solicitudRegistroSchema>;

/** Solicitud tal como la ve quien la revisa. */
export const solicitudSchema = mongoDoc.extend({
  cedula: z.string().nullable().optional(),
  nombres: z.string().optional().default(''),
  apellidos: z.string().optional().default(''),
  sede: z.string().nullable().optional(),
  facultad: z.string().nullable().optional(),
  niveles: z.array(z.string()).optional().default([]),
  programas: z.array(z.string()).optional().default([]),
  estado: z.enum(['PENDIENTE', 'APROBADO', 'RECHAZADO']),
  motivoRechazo: z.string().optional().default(''),
  userId: z
    .object({ _id: z.string(), email: z.string(), fullName: z.string() })
    .partial()
    .nullable()
    .optional(),
});
export type Solicitud = z.infer<typeof solicitudSchema>;

// ── Avisos ──────────────────────────────────────────────────────────────────

export const tipoAviso = z.enum(['INFORMATIVO', 'IMPORTANTE', 'URGENTE']);
export type TipoAviso = z.infer<typeof tipoAviso>;

/**
 * Autor del aviso.
 *
 * El listado lo devuelve poblado (`{ fullName }`) y la respuesta de crear traía
 * el ObjectId a secas: Mongoose no puebla lo que acaba de insertar. Aceptar
 * solo la forma poblada hacía que publicar terminara siempre en «El servidor
 * respondió en un formato inesperado» — con el aviso ya guardado, así que el
 * administrador reintentaba y salían duplicados. Las dos formas valen y se
 * normalizan a una: sin nombre, no hay autor que mostrar.
 */
const autorAviso = z
  .union([z.object({ fullName: z.string() }).partial(), z.string(), z.null()])
  .optional()
  .transform(valor => (valor && typeof valor === 'object' ? valor : null));

export const avisoSchema = mongoDoc.extend({
  titulo: z.string(),
  cuerpo: z.string(),
  tipo: tipoAviso,
  sedes: z.array(z.string()).optional().default([]),
  facultades: z.array(z.string()).optional().default([]),
  programas: z.array(z.string()).optional().default([]),
  publicadoEn: z.string(),
  expiraEn: z.string().nullable().optional(),
  fijado: z.boolean().optional().default(false),
  leido: z.boolean().optional().default(false),
  lecturas: z.number().optional().default(0),
  autorId: autorAviso,
});
export type Aviso = z.infer<typeof avisoSchema>;

export const avisoInputSchema = z.object({
  titulo: z.string().min(4, 'El título es demasiado corto').max(140),
  cuerpo: z.string().min(10, 'Escribe el contenido').max(4000),
  tipo: tipoAviso,
  sedes: z.array(sedeId).default([]),
  facultades: z.array(facultadId).default([]),
  programas: z.array(z.string()).default([]),
  fijado: z.boolean().default(false),
});
export type AvisoInput = z.infer<typeof avisoInputSchema>;

// ── Enlaces de descarga ─────────────────────────────────────────────────────

/**
 * A dónde apuntan los botones de la página pública de descargas.
 *
 * Se guardan en el servidor y no en el HTML del sitio para que publicar una
 * versión no obligue a editar y desplegar la página. Los mismos hosts que
 * acepta el backend: si aquí se dejara pasar cualquiera, el error saldría al
 * guardar en vez de al escribir.
 */
export const HOSTS_DESCARGA = [
  'dropbox.com',
  'www.dropbox.com',
  'dl.dropboxusercontent.com',
  'github.com',
  'objects.githubusercontent.com',
] as const;

export const enlaceDescarga = z
  .string()
  .trim()
  .max(2000)
  .refine(valor => {
    if (valor === '') return true;
    try {
      const url = new URL(valor);
      return url.protocol === 'https:' && (HOSTS_DESCARGA as readonly string[]).includes(url.hostname);
    } catch {
      return false;
    }
  }, 'Tiene que ser un enlace https de Dropbox o de GitHub.');

export const enlacesDescargaSchema = z.object({
  windows: enlaceDescarga,
  android: enlaceDescarga,
});
export type EnlacesDescarga = z.infer<typeof enlacesDescargaSchema>;
