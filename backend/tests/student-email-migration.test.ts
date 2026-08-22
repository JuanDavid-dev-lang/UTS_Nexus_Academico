import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';
import { auditStudentEmails } from '../src/scripts/migrate-student-emails.js';

const row = (code: string, email?: unknown) => ({ _id: new mongoose.Types.ObjectId(), code, email });

describe('auditStudentEmails', () => {
  it('separa ausentes, inválidos y valores que requieren normalización', () => {
    const report = auditStudentEmails([
      row('1'),
      row('0', '   '),
      row('2', 'correo-invalido'),
      row('3', ' ANA@UTS.EDU.CO '),
    ]);
    expect(report.missing.map(item => item.code)).toEqual(['1', '0']);
    expect(report.emptyToNull).toHaveLength(1);
    expect(report.invalid.map(item => item.code)).toEqual(['2']);
    expect(report.updates).toHaveLength(1);
    expect(report.updates[0]?.email).toBe('ana@uts.edu.co');
  });

  it('detecta duplicados después de normalizar mayúsculas y espacios', () => {
    const report = auditStudentEmails([
      row('1', 'ana@uts.edu.co'),
      row('2', ' ANA@UTS.EDU.CO '),
    ]);
    expect(report.duplicates).toEqual([{ email: 'ana@uts.edu.co', codes: ['1', '2'] }]);
  });
});
