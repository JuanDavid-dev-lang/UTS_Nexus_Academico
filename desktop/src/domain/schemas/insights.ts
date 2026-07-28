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
]);
export type NotificationType = z.infer<typeof notificationType>;

export const notificationSchema = mongoDoc.extend({
  userId: objectId.optional(),
  title: z.string(),
  message: z.string(),
  type: notificationType.catch('ACTIVITY'),
  channel: z.string().optional().default('IN_APP'),
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
  source: z.enum(['ollama', 'rules']).optional().default('rules'),
  model: z.string().optional(),
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
