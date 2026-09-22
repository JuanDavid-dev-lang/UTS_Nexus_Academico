/**
 * Notas, consolidado y pendientes de calificar.
 *
 * La aritmética NO se reproduce aquí. El motor canónico (30/60/10 por
 * componente, 33/33/34 por corte) vive en el backend; duplicarlo en el cliente
 * es como los dos empiezan a discrepar sobre quién aprobó.
 */
import { z } from 'zod';
import { mongoDoc, numberish, objectId } from './common';
import { nivelCoincidencia } from './attendance';

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
  /** Peso relativo dentro del componente; 1 si nadie lo indicó. */
  weight: numberish.optional().default(1),
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
  /**
   * Peso relativo dentro del componente. Opcional: sin él, el servidor toma el
   * de la plantilla aplicada al grupo y, si no hay, 1.
   */
  weight: z.number().min(0.01).max(1000).optional(),
});
export type GradeInput = z.infer<typeof gradeInputSchema>;

/** Una nota concreta dentro de un componente, con el motivo que le puso el docente. */
export const gradeDetailSchema = z.object({
  id: z.string(),
  label: z.string(),
  score: numberish,
  /*
   * Peso con el que entró y su fracción del componente. Opcionales con
   * defecto: un servidor anterior no los manda y el desglose se pinta como
   * promedio simple, que es lo que era.
   */
  weight: numberish.optional().default(1),
  pesoRelativo: numberish.optional(),
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

// ── Importación de calificaciones ───────────────────────────────────────────
// Reutiliza `nivelCoincidencia` del escáner de asistencia: es el mismo cruce
// fila↔matriculado.

export const filaNotasImportSchema = z.object({
  indice: numberish,
  cedulaLeida: z.string(),
  nombreLeido: z.string(),
  studentId: objectId.nullable(),
  code: z.string().nullable(),
  fullName: z.string().nullable(),
  nivel: nivelCoincidencia,
  confianza: numberish,
  notas: z.array(z.number().nullable()),
  avisos: z.array(z.string()),
});
export type FilaNotasImport = z.infer<typeof filaNotasImportSchema>;

/** Propuesta del servidor. Solo describe: la escritura es `POST /grades/bulk`. */
export const escaneoNotasSchema = z.object({
  ok: z.literal(true),
  origen: z.string(),
  groupId: objectId,
  subjectId: objectId,
  period: z.string(),
  columnas: numberish,
  avisos: z.array(z.string()),
  filas: z.array(filaNotasImportSchema),
  sinFila: z.array(z.object({ id: objectId, code: z.string(), fullName: z.string() })),
});
export type EscaneoNotas = z.infer<typeof escaneoNotasSchema>;

// ── Plantillas de corte y estructuras aplicadas ─────────────────────────────
// Una plantilla es del docente: qué notas lleva cada componente y con qué peso
// relativo. Aplicarla a una materia (y a un grupo) deja una estructura por
// corte que la captura usa para proponer lo que falta. Ver
// `backend/src/domains/grading/plantilla-notas.ts`.

export const notaPlantillaSchema = z.object({
  label: z.string().min(1, 'Escribe el nombre').max(60, 'Máximo 60 caracteres'),
  weight: z.number().min(0.01, 'Mayor que 0').max(1000, 'Máximo 1000'),
});
export type NotaPlantilla = z.infer<typeof notaPlantillaSchema>;

export const componentePlantillaSchema = z.object({
  tipo: componentType,
  notas: z.array(notaPlantillaSchema).max(20),
});
export type ComponentePlantilla = z.infer<typeof componentePlantillaSchema>;

export const plantillaNotasSchema = mongoDoc.extend({
  professorId: objectId,
  name: z.string(),
  componentes: z.array(componentePlantillaSchema).optional().default([]),
});
export type PlantillaNotas = z.infer<typeof plantillaNotasSchema>;

export const plantillaNotasInputSchema = z.object({
  name: z.string().trim().min(1, 'Ponle un nombre').max(80),
  componentes: z.array(componentePlantillaSchema).max(3),
});
export type PlantillaNotasInput = z.infer<typeof plantillaNotasInputSchema>;

export const corteEstructuraSchema = z.object({
  corte: numberish,
  componentes: z.array(componentePlantillaSchema).optional().default([]),
});
export type CorteEstructura = z.infer<typeof corteEstructuraSchema>;

export const estructuraNotasSchema = z.object({
  _id: objectId,
  subjectId: objectId,
  groupId: objectId.nullable().optional().default(null),
  period: z.string(),
  professorId: objectId,
  plantillaId: objectId.nullable().optional().default(null),
  nombre: z.string().optional().default(''),
  cortes: z.array(corteEstructuraSchema).optional().default([]),
});
export type EstructuraNotas = z.infer<typeof estructuraNotasSchema>;

export const estructuraNotasInputSchema = z.object({
  subjectId: objectId,
  groupId: objectId.nullable().optional(),
  period: z.string().min(4),
  plantillaId: objectId.nullable().optional(),
  nombre: z.string().max(80).optional(),
  cortes: z.array(z.object({ corte: cutNumber, componentes: z.array(componentePlantillaSchema).max(3) })).min(1).max(3),
});
export type EstructuraNotasInput = z.infer<typeof estructuraNotasInputSchema>;
