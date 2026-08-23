import { describe, expect, it } from 'vitest';
import { studentInputSchema, studentSchema } from '@/domain/schemas/students';

describe('studentSchema', () => {
  const base = { _id: '507f1f77bcf86cd799439011', code: '1098765432', fullName: 'Ana', program: 'Sistemas' };

  it.each([{ ...base }, { ...base, email: null }])('tolera estudiantes antiguos sin correo', (value) => {
    expect(studentSchema.parse(value).email).toBe('');
  });

  it('normaliza el correo de entrada y permite que sea desconocido', () => {
    expect(studentInputSchema.parse({ ...base, email: ' ANA@UTS.EDU.CO ' }).email).toBe('ana@uts.edu.co');
    expect(studentInputSchema.parse({ ...base, email: '   ' }).email).toBeUndefined();
    expect(studentInputSchema.parse({ ...base }).email).toBeUndefined();
  });

  it('rechaza un correo con formato inválido', () => {
    expect(studentInputSchema.safeParse({ ...base, email: 'ana@' }).success).toBe(false);
  });
});
