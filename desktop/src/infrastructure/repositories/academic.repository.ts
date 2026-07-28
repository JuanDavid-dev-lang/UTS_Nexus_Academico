/**
 * HTTP adapters for the academic ports.
 *
 * Thin by design: map arguments to the endpoint contract, validate, return
 * domain types. Any calculation here would be a second source of truth
 * competing with the backend's grading engine.
 */
import { http } from '@/core/api/http-client';
import { itemResponse, itemsResponse, okResponse } from '@/domain/schemas/common';
import {
  attendanceSchema,
  attendanceSummarySchema,
  consolidatedResponseSchema,
  enrollmentSchema,
  gradeSchema,
  groupSchema,
  studentSchema,
  subjectSchema,
  type GradeInput,
  type StudentInput,
  type SubjectInput,
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

function scopeToQuery(scope: Scope): Record<string, string | undefined> {
  return {
    period: scope.period,
    subjectId: scope.subjectId,
    groupId: scope.groupId,
    studentId: scope.studentId,
  };
}

export const studentRepository: StudentRepository = {
  async list() {
    return (await http.get('/students', { schema: studentsResponse })).items;
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
