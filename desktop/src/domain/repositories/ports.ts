/**
 * Repository ports (hexagonal architecture).
 *
 * These interfaces describe WHAT the application needs, never HOW it is
 * fetched. No React, no fetch, no Tauri in this file - which is exactly what
 * makes the features testable with a fake repository instead of a live server.
 *
 * Implementations live in `src/infrastructure/repositories`.
 */
import type {
  Attendance,
  ConsolidatedRow,
  PendingSubject,
  InterventionStatus,
  Enrollment,
  Grade,
  GradeInput,
  Group,
  RiskItem,
  RosterRow,
  Student,
  StudentDirectoryEntry,
  StudentInput,
  Subject,
  SubjectInput,
} from '@/domain/schemas/academic';
import type { LoginInput, User } from '@/domain/schemas/auth';
import type {
  AiStatus,
  ChatResponse,
  ChatMessage,
  DashboardSummary,
  Notification,
  Prediction,
  ReportPreview,
  ReportTemplate,
  ReportTemplateData,
} from '@/domain/schemas/insights';
import type {
  AgendaItem,
  AgendaResumen,
  AgendaTipo,
  CalendarEvent,
  CalendarEventInput,
  NotificationPreferences,
} from '@/domain/schemas/agenda';

export type Scope = {
  period?: string;
  subjectId?: string;
  groupId?: string;
  studentId?: string;
};

export interface AuthRepository {
  login(input: LoginInput): Promise<{ user: User; accessToken: string; refreshToken: string }>;
  me(): Promise<User>;
  logout(): Promise<void>;
}

export interface StudentRepository {
  /**
   * Sin ámbito devuelve los estudiantes visibles para el rol; con `subjectId`
   * o `groupId`, solo los de esa asignatura. El backend intersecta el filtro
   * con el ámbito del docente, así que pedir una materia ajena no devuelve nada.
   */
  list(scope?: Scope & { q?: string }): Promise<Student[]>;
  /** Directorio global por nombre o cédula, para matricular en una materia nueva. */
  search(q: string): Promise<StudentDirectoryEntry[]>;
  create(input: StudentInput): Promise<Student>;
  update(id: string, input: Partial<StudentInput>): Promise<Student>;
  remove(id: string): Promise<void>;
  createMany(input: StudentInput[]): Promise<number>;
}

export interface SubjectRepository {
  list(): Promise<Subject[]>;
  create(input: SubjectInput & { professorId: string }): Promise<Subject>;
  update(id: string, input: Partial<SubjectInput>): Promise<Subject>;
  remove(id: string): Promise<void>;
}

export interface GroupRepository {
  list(): Promise<Group[]>;
}

export interface EnrollmentRepository {
  list(scope: Scope): Promise<Enrollment[]>;
  /** Matricula a un estudiante que ya existe en el sistema. */
  enroll(input: { studentId: string; groupId: string }): Promise<Enrollment>;
  /**
   * Importa una lista completa: crea o actualiza cada estudiante por cédula y
   * lo matricula en el grupo. Devuelve cuántos quedaron matriculados.
   */
  importRoster(input: { groupId: string; students: RosterRow[] }): Promise<number>;
  /**
   * Lee un listado desde un PDF o una foto. Solo PROPONE: la escritura sigue
   * siendo `importRoster`, con lo que el docente ya revisó.
   */
  scanRoster(
    groupId: string,
    file: File,
  ): Promise<{
    origen: string;
    avisos: string[];
    filas: Array<{
      code: string;
      fullName: string;
      email?: string;
      program?: string;
      confianza: number;
      avisos: string[];
    }>;
  }>;
  /** Retira una matrícula (baja lógica, no borra al estudiante). */
  remove(id: string): Promise<void>;
}

export interface GradeRepository {
  list(scope: Scope): Promise<Grade[]>;
  consolidated(scope: Scope & { period: string }): Promise<ConsolidatedRow[]>;
  /** Lo que queda por calificar, contado sobre los matriculados. */
  pending(period: string, subjectId?: string): Promise<PendingSubject[]>;
  save(input: GradeInput): Promise<Grade>;
  remove(id: string): Promise<void>;
}

export interface AttendanceRepository {
  list(scope: Scope): Promise<Attendance[]>;
  mark(input: {
    studentId: string;
    subjectId: string;
    groupId?: string;
    teacherId: string;
    period: string;
    date: string;
    present: boolean;
    durationMinutes?: number;
    notes?: string;
  }): Promise<Attendance>;
  summaryFor(studentId: string): Promise<{
    totalClasses: number;
    misses: number;
    attendanceRate: number;
  }>;
}

export interface AnalyticsRepository {
  dashboard(): Promise<DashboardSummary>;
  risks(): Promise<RiskItem[]>;
  /** Anota qué se hizo con un estudiante en riesgo. */
  saveIntervention(input: {
    studentId: string;
    subjectId: string;
    period: string;
    estado: InterventionStatus;
    nota: string;
  }): Promise<void>;
}

export interface NotificationRepository {
  list(): Promise<Notification[]>;
  markRead(id: string): Promise<void>;
  scanRisks(period?: string): Promise<{ created: number; scanned: number }>;
}

/**
 * Agenda académica.
 *
 * `range` devuelve las clases YA expandidas a ocurrencias con fecha: el cliente
 * no vuelve a calcular a qué hora es una clase, para que PC y Android no puedan
 * discrepar.
 */
export interface AgendaRepository {
  range(input: {
    desde: Date;
    hasta: Date;
    subjectId?: string;
    groupId?: string;
    tipos?: AgendaTipo[];
  }): Promise<{ items: AgendaItem[]; campusOffsetMinutes: number }>;
  summary(): Promise<AgendaResumen>;
  listEvents(desde: Date, hasta: Date): Promise<CalendarEvent[]>;
  createEvent(input: CalendarEventInput): Promise<CalendarEvent>;
  updateEvent(id: string, input: Partial<CalendarEventInput>): Promise<CalendarEvent>;
  removeEvent(id: string): Promise<void>;
}

export interface NotificationPreferencesRepository {
  get(): Promise<{ preferences: NotificationPreferences; pushConfigurado: boolean }>;
  update(
    input: Partial<NotificationPreferences>,
  ): Promise<{ preferences: NotificationPreferences; pushConfigurado: boolean }>;
  markAllRead(): Promise<number>;
  remove(id: string): Promise<void>;
}

export interface AssistantRepository {
  status(): Promise<AiStatus>;
  chat(input: {
    message: string;
    history: ChatMessage[];
    studentId?: string;
    subjectId?: string;
    groupId?: string;
    context?: { page?: string; courseId?: string; groupId?: string };
  }): Promise<ChatResponse>;
  predict(input: { studentId: string; subjectId: string }): Promise<Prediction>;
}

export type ReportFormat = 'pdf' | 'excel';
export type ReportKind = 'consolidado' | 'grades' | 'attendance' | 'combined';

export interface ReportRepository {
  download(format: ReportFormat, kind: ReportKind, scope: Scope): Promise<Blob>;
  /** Las mismas filas que saldrán en el archivo, para revisarlas antes de descargar. */
  previewAttendance(scope: Scope): Promise<ReportPreview>;
  /** Plantilla vigente + catálogo de columnas disponibles por tipo. */
  getTemplate(): Promise<ReportTemplateData>;
  /** Guarda la plantilla (solo ADMIN en el servidor). */
  saveTemplate(plantilla: ReportTemplate): Promise<ReportTemplate>;
}
