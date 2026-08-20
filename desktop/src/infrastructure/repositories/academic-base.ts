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

export const studentsResponse = itemsResponse(studentSchema);
export const studentResponse = itemResponse(studentSchema);
export const subjectsResponse = itemsResponse(subjectSchema);
export const subjectResponse = itemResponse(subjectSchema);
export const groupsResponse = itemsResponse(groupSchema);
export const groupResponse = itemResponse(groupSchema);
export const gradesResponse = itemsResponse(gradeSchema);
export const gradeResponse = itemResponse(gradeSchema);
export const attendanceResponse = itemsResponse(attendanceSchema);
export const attendanceItemResponse = itemResponse(attendanceSchema);
export const enrollmentsResponse = itemsResponse(enrollmentSchema);
export const enrollmentResponse = itemResponse(enrollmentSchema);
export const directoryResponse = itemsResponse(studentDirectoryEntrySchema);
export const importResponse = z.object({ ok: z.literal(true), count: z.number() });

/**
 * Propuesta de listado leído de un PDF o una foto.
 *
 * Cada fila trae su confianza porque no todas valen lo mismo: un PDF con capa
 * de texto llega en 1.0 —no hubo reconocimiento que pueda fallar— y una foto
 * llega con lo que el OCR crea. Esa diferencia es la que decide qué revisar.
 */
export const rosterScanResponse = z.object({
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

export function scopeToQuery(scope: Scope): Record<string, string | undefined> {
  return {
    period: scope.period,
    subjectId: scope.subjectId,
    groupId: scope.groupId,
    studentId: scope.studentId,
  };
}

// Reexportado para los adaptadores, que consumen estas piezas por su nombre.
export {
  AttendanceRepository,
  Aviso,
  AvisoInput,
  Catalogo,
  CutNumber,
  EnlacesDescarga,
  EnrollmentRepository,
  EscaneoNotas,
  EscaneoPlanilla,
  EstadoFeedback,
  EtapaTrabajoGrado,
  Feedback,
  FeedbackInput,
  GradeInput,
  GradeRepository,
  GroupRepository,
  ProfesorAdmin,
  RosterRow,
  Scope,
  Solicitud,
  SolicitudRegistro,
  StudentInput,
  StudentRepository,
  SubjectInput,
  SubjectRepository,
  ThesisFormat,
  TipoFeedback,
  attendanceSchema,
  attendanceSummarySchema,
  avisoSchema,
  catalogoSchema,
  consolidatedResponseSchema,
  enlacesDescargaSchema,
  enrollmentSchema,
  escaneoNotasSchema,
  escaneoPlanillaSchema,
  feedbackSchema,
  gradeSchema,
  groupSchema,
  http,
  itemResponse,
  itemsResponse,
  okResponse,
  pendingResponseSchema,
  profesorAdminSchema,
  request,
  solicitudSchema,
  studentDirectoryEntrySchema,
  studentSchema,
  subjectSchema,
  thesisFormatSchema,
  z,
};
