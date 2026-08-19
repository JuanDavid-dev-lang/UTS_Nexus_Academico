/**
 * Dashboard analytics, notifications and AI assistant contracts.
 */
import { z } from 'zod';
import { mongoDoc, numberish, objectId, riskLevel } from './common';

// ── Dashboard ───────────────────────────────────────────────────────────────
export const dashboardSummarySchema = z.object({
  totalStudents: numberish,
  totalSubjects: numberish,
  averageGrade: numberish,
  averageAttendance: numberish,
  approvedStudents: numberish,
  failedStudents: numberish,
  riskStudents: numberish,
  criticalSubjects: numberish,
  missedClasses: numberish,
});
export type DashboardSummary = z.infer<typeof dashboardSummarySchema>;

export const dashboardResponseSchema = z.object({
  ok: z.literal(true),
  summary: dashboardSummarySchema,
});

// ── Notifications ───────────────────────────────────────────────────────────
export const notificationType = z.enum([
  'CLASS',
  'GRADE',
  'RISK',
  'ATTENDANCE',
  'ACTIVITY',
  'EXAM',
  'DEADLINE',
  // Añadidos con la agenda.
  'EVENT',
  'REMINDER',
  'SCHEDULE',
  'SISTEMA',
]);
export type NotificationType = z.infer<typeof notificationType>;

/** Cuánto corre. Ordena la bandeja y decide si atraviesa las horas de silencio. */
export const notificationPriority = z.enum(['URGENT', 'IMPORTANT', 'INFO', 'SYSTEM']);
export type NotificationPriority = z.infer<typeof notificationPriority>;

export const notificationSchema = mongoDoc.extend({
  userId: objectId.optional(),
  title: z.string(),
  message: z.string(),
  type: notificationType.catch('ACTIVITY'),
  priority: notificationPriority.catch('INFO'),
  channel: z.string().optional().default('IN_APP'),
  /** Ruta interna a la que lleva al tocarla: `/agenda?item=…`. Nunca una URL externa. */
  link: z.string().optional().default(''),
  /** The API stores a timestamp, not a boolean: null means unread. */
  readAt: z.string().nullable().optional().default(null),
  metadata: z.record(z.unknown()).optional().default({}),
});
export type Notification = z.infer<typeof notificationSchema>;

export function isUnread(notification: Notification): boolean {
  return !notification.readAt;
}

export const riskScanResponseSchema = z.object({
  ok: z.literal(true),
  created: numberish.optional().default(0),
  scanned: numberish.optional().default(0),
});

// ── AI assistant ────────────────────────────────────────────────────────────
export const aiStatusSchema = z.object({
  ok: z.literal(true),
  enabled: z.boolean(),
  available: z.boolean().optional().default(false),
  model: z.string().optional().default(''),
  baseUrl: z.string().optional().default(''),
  models: z.array(z.string()).optional().default([]),
  modelReady: z.boolean().optional().default(false),
  message: z.string().optional(),
  rubri: z.object({
    available: z.boolean(),
    model: z.string().optional(),
    metrics: z.unknown().optional(),
  }).optional(),
});
export type AiStatus = z.infer<typeof aiStatusSchema>;

export const chatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
});
export type ChatMessage = z.infer<typeof chatMessageSchema>;

export const chatResponseSchema = z.object({
  ok: z.literal(true),
  answer: z.string(),
  /** 'ollama' when the local model answered, 'rules' when it fell back. */
  source: z.enum(['ollama', 'rules', 'intent-model']).optional().default('rules'),
  model: z.string().optional(),
  emotion: z.enum(['neutral', 'happy', 'sad', 'offline']).optional().default('neutral'),
  rubri: z.object({
    intent: z.string(),
    confidence: z.number(),
    model: z.string(),
    latencyMs: z.number(),
    action: z.object({
      type: z.literal('NAVIGATE'),
      route: z.string(),
      label: z.string(),
    }).nullable(),
  }).nullable().optional().default(null),
});
export type ChatResponse = z.infer<typeof chatResponseSchema>;

// ── Report preview ──────────────────────────────────────────────────────────
/**
 * Vista previa de un reporte: las mismas filas que saldrían en el PDF/Excel,
 * construidas por el mismo catálogo de columnas del backend. El cliente solo
 * las pinta — no recalcula ni reordena nada.
 */
export const reportPreviewSchema = z.object({
  ok: z.literal(true),
  headers: z.array(z.string()),
  rows: z.array(z.array(z.string())),
  total: numberish,
  truncado: z.boolean().optional().default(false),
});
export type ReportPreview = z.infer<typeof reportPreviewSchema>;

// ── Report template ─────────────────────────────────────────────────────────
/**
 * Plantilla de los reportes exportados. El backend es la autoridad del shape
 * (`report-template.ts`); aquí solo se valida lo que llega y lo que se envía.
 */
export const reportTemplateSchema = z.object({
  institucion: z.string(),
  sigla: z.string(),
  titulos: z
    .object({
      consolidado: z.string().optional(),
      grades: z.string().optional(),
      attendance: z.string().optional(),
      combined: z.string().optional(),
    })
    .default({}),
  logoUrl: z.string().nullable().default(null),
  colores: z.object({
    marca: z.string(),
    encabezadoTabla: z.string(),
    encabezadoExcel: z.string(),
  }),
  columnas: z
    .object({
      consolidado: z.array(z.string()).optional(),
      grades: z.array(z.string()).optional(),
      attendance: z.array(z.string()).optional(),
    })
    .default({}),
});
export type ReportTemplate = z.infer<typeof reportTemplateSchema>;

export const reportColumnOptionSchema = z.object({ key: z.string(), header: z.string() });
export type ReportColumnOption = z.infer<typeof reportColumnOptionSchema>;

export const reportTemplateResponseSchema = z.object({
  ok: z.literal(true),
  plantilla: reportTemplateSchema,
  columnasDisponibles: z.object({
    consolidado: z.array(reportColumnOptionSchema),
    grades: z.array(reportColumnOptionSchema),
    attendance: z.array(reportColumnOptionSchema),
  }),
});
export type ReportTemplateData = Omit<z.infer<typeof reportTemplateResponseSchema>, 'ok'>;

export const reportTemplateSaveResponseSchema = z.object({
  ok: z.literal(true),
  plantilla: reportTemplateSchema,
});

// ── Prediction ("what does this student need to pass?") ─────────────────────
export const predictionSchema = z.object({
  ok: z.literal(true),
  result: z.object({
    studentId: objectId,
    subjectId: objectId,
    studentName: z.string(),
    currentAverage: numberish,
    attendanceRate: numberish,
    neededToPass: numberish,
    riskLevel,
    scenarios: z.array(z.object({ score: numberish, finalAverage: numberish })),
    recommendations: z.array(z.string()),
  }),
});
export type Prediction = z.infer<typeof predictionSchema>['result'];
