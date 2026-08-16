import { z } from 'zod';
import { http } from '@/core/api/http-client';
import { itemsResponse, okResponse } from '@/domain/schemas/common';
import { riskResponseSchema, type InterventionStatus } from '@/domain/schemas/academic';
import {
  aiStatusSchema,
  chatResponseSchema,
  dashboardResponseSchema,
  notificationSchema,
  predictionSchema,
  reportPreviewSchema,
  reportTemplateResponseSchema,
  reportTemplateSaveResponseSchema,
  riskScanResponseSchema,
  type ReportTemplate,
} from '@/domain/schemas/insights';
import type {
  AnalyticsRepository,
  AssistantRepository,
  NotificationRepository,
  ReportFormat,
  ReportKind,
  ReportRepository,
  Scope,
} from '@/domain/repositories/ports';
import { env } from '@/core/config/env';

const notificationsResponse = itemsResponse(notificationSchema);

export const analyticsRepository: AnalyticsRepository = {
  async dashboard() {
    return (await http.get('/analytics/dashboard', { schema: dashboardResponseSchema })).summary;
  },

  async risks() {
    return (await http.get('/analytics/risks', { schema: riskResponseSchema })).items;
  },

  /**
   * Anota qué se hizo con un estudiante en riesgo.
   *
   * Escribe sobre el mismo caso que usa la realimentación del modelo: qué
   * predijo el sistema, qué hizo el docente y cómo terminó son tres partes de
   * la misma historia.
   */
  async saveIntervention(input: {
    studentId: string;
    subjectId: string;
    period: string;
    estado: InterventionStatus;
    nota: string;
  }) {
    await http.patch('/analytics/risks/intervencion', input, {
      schema: z.object({ ok: z.literal(true) }).passthrough(),
    });
  },
};

export const notificationRepository: NotificationRepository = {
  async list() {
    return (await http.get('/notifications', { schema: notificationsResponse })).items;
  },

  async markRead(id: string) {
    await http.patch(`/notifications/${id}/read`, undefined, { schema: okResponse });
  },

  async scanRisks(period?: string) {
    const data = await http.post('/notifications/risks/scan', undefined, {
      schema: riskScanResponseSchema,
      query: { period },
      // Scanning walks every student in scope; it needs the long budget.
      timeoutMs: env.longRequestTimeoutMs,
    });
    return { created: data.created, scanned: data.scanned };
  },
};

export const assistantRepository: AssistantRepository = {
  async status() {
    return http.get('/ai/status', { schema: aiStatusSchema });
  },

  async chat(input) {
    const data = await http.post(
      '/ai/chat',
      {
        message: input.message,
        // The backend only keeps the last few turns; sending more wastes tokens
        // and slows the local model down for no gain.
        history: input.history.slice(-6),
        ...(input.studentId ? { studentId: input.studentId } : {}),
        ...(input.subjectId ? { subjectId: input.subjectId } : {}),
      },
      { schema: chatResponseSchema, timeoutMs: env.longRequestTimeoutMs },
    );
    return { answer: data.answer, source: data.source };
  },

  async predict(input) {
    const data = await http.post(
      '/ai/predict',
      { studentId: input.studentId, subjectId: input.subjectId },
      { schema: predictionSchema },
    );
    return data.result;
  },
};

/** Maps a (format, kind) pair to its endpoint. */
const REPORT_PATHS: Record<ReportFormat, Record<ReportKind, string>> = {
  pdf: {
    consolidado: '/reports/pdf/consolidado',
    grades: '/reports/pdf/grades',
    attendance: '/reports/pdf/attendance',
    combined: '/reports/pdf/combined',
  },
  excel: {
    consolidado: '/reports/excel/consolidado',
    grades: '/reports/excel/grades',
    attendance: '/reports/excel/attendance',
    combined: '/reports/excel/combined',
  },
};

export const reportRepository: ReportRepository = {
  async download(format: ReportFormat, kind: ReportKind, scope: Scope) {
    return http.blob(REPORT_PATHS[format][kind], {
      period: scope.period,
      subjectId: scope.subjectId,
      groupId: scope.groupId,
      studentId: scope.studentId,
    });
  },

  async previewAttendance(scope: Scope) {
    return http.get('/reports/preview/attendance', {
      schema: reportPreviewSchema,
      query: {
        period: scope.period,
        subjectId: scope.subjectId,
        groupId: scope.groupId,
        studentId: scope.studentId,
      },
    });
  },

  async getTemplate() {
    const data = await http.get('/reports/template', { schema: reportTemplateResponseSchema });
    return { plantilla: data.plantilla, columnasDisponibles: data.columnasDisponibles };
  },

  async saveTemplate(plantilla: ReportTemplate) {
    const data = await http.put('/reports/template', plantilla, {
      schema: reportTemplateSaveResponseSchema,
    });
    return data.plantilla;
  },
};
