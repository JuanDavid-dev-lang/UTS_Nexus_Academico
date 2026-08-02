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

/** Per-component breakdown returned by the canonical grading engine. */
export const componentSummarySchema = z.object({
  tipo: componentType,
  peso: numberish,
  promedio: numberish,
  registros: numberish,
  aporte: numberish,
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
