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
  Enrollment,
  Grade,
  GradeInput,
  Group,
  RiskItem,
  Student,
  StudentInput,
  Subject,
  SubjectInput,
} from '@/domain/schemas/academic';
import type { LoginInput, User } from '@/domain/schemas/auth';
import type {
  AiStatus,
  ChatMessage,
  DashboardSummary,
  Notification,
  Prediction,
} from '@/domain/schemas/insights';

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
  list(): Promise<Student[]>;
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
}

export interface GradeRepository {
  list(scope: Scope): Promise<Grade[]>;
  consolidated(scope: Scope & { period: string }): Promise<ConsolidatedRow[]>;
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
}

export interface NotificationRepository {
  list(): Promise<Notification[]>;
  markRead(id: string): Promise<void>;
  scanRisks(period?: string): Promise<{ created: number; scanned: number }>;
}

export interface AssistantRepository {
  status(): Promise<AiStatus>;
  chat(input: {
    message: string;
    history: ChatMessage[];
    studentId?: string;
    subjectId?: string;
  }): Promise<{ answer: string; source: 'ollama' | 'rules' }>;
  predict(input: { studentId: string; subjectId: string }): Promise<Prediction>;
}

export type ReportFormat = 'pdf' | 'excel';
export type ReportKind = 'consolidado' | 'grades' | 'attendance' | 'combined';

export interface ReportRepository {
  download(format: ReportFormat, kind: ReportKind, scope: Scope): Promise<Blob>;
}
