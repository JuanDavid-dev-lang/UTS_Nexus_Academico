import type { FilterQuery } from 'mongoose';
import { StudentModel } from '../../models/student.model.js';

export type StudentInput = {
  code: string;
  fullName: string;
  email?: string | null;
  program: string;
  photoUrl?: string | null;
};

export class StudentConflictError extends Error {
  statusCode = 409;

  constructor() {
    super('El correo ya está registrado para otro estudiante.');
  }
}

/** Valida el lote y la base antes de escribir; el índice cubre las carreras concurrentes. */
export async function assertUniqueStudentEmails(
  rows: Array<{ code: string; email?: string | null }>,
): Promise<void> {
  const byEmail = new Map<string, string>();
  for (const row of rows) {
    if (!row.email) continue;
    const previousCode = byEmail.get(row.email);
    if (previousCode && previousCode !== row.code) throw new StudentConflictError();
    byEmail.set(row.email, row.code);
  }

  if (byEmail.size === 0) return;
  const existing = await StudentModel.find({
    deletedAt: null,
    email: { $in: [...byEmail.keys()] },
  }).select('code email').lean();

  if (existing.some(student => student.email && byEmail.get(student.email) !== student.code)) {
    throw new StudentConflictError();
  }
}

export async function listStudents(filter: FilterQuery<unknown>, skip: number, limit: number) {
  const [items, total] = await Promise.all([
    StudentModel.find(filter).sort({ code: 1, fullName: 1 }).skip(skip).limit(limit).lean(),
    StudentModel.countDocuments(filter),
  ]);
  return { items, total };
}

export async function searchStudents(term: RegExp, limit: number) {
  return StudentModel.find({ deletedAt: null, $or: [{ fullName: term }, { code: term }] })
    .select('code fullName program photoUrl')
    .sort({ code: 1 })
    .limit(limit)
    .lean();
}

export function findStudent(id: string) {
  return StudentModel.findOne({ _id: id, deletedAt: null }).lean();
}

export async function createStudent(input: StudentInput) {
  await assertUniqueStudentEmails([input]);
  return StudentModel.create(input);
}

export async function upsertStudents(rows: StudentInput[]) {
  await assertUniqueStudentEmails(rows);
  const codes = [...new Set(rows.map(row => row.code))];
  await StudentModel.bulkWrite(rows.map(row => {
    const { email, ...rest } = row;
    return {
      updateOne: {
        filter: { code: row.code, deletedAt: null },
        update: {
          // Omitir el correo conserva el que ya existe; null solo se usa al
          // crear un expediente legado sin ese dato.
          $set: { ...rest, ...(email ? { email } : {}) },
          $setOnInsert: {
            ...(email ? {} : { email: null }),
            attendanceRate: 0,
            academicPerformance: 0,
          },
        },
        upsert: true,
      },
    };
  }), { ordered: false });
  return StudentModel.find({ code: { $in: codes }, deletedAt: null }).sort({ code: 1 }).lean();
}

export async function updateStudent(id: string, changes: Record<string, unknown>) {
  const current = await StudentModel.findOne({ _id: id, deletedAt: null }).select('code').lean();
  if (!current) return null;
  if (typeof changes.email === 'string') {
    await assertUniqueStudentEmails([{ code: current.code, email: changes.email }]);
  }
  return StudentModel.findOneAndUpdate(
    { _id: id, deletedAt: null },
    { $set: changes },
    { new: true },
  );
}

export function softDeleteStudent(id: string) {
  return StudentModel.findOneAndUpdate(
    { _id: id, deletedAt: null },
    { $set: { deletedAt: new Date(), status: 'DELETED' } },
    { new: true },
  );
}
