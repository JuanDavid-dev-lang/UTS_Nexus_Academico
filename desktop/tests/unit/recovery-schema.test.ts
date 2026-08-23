import { describe, expect, it } from 'vitest';
import {
  recoveryEmailSchema,
  recoveryPasswordSchema,
  recoveryRequestSchema,
} from '@/domain/schemas/auth';

describe('contrato de recuperación', () => {
  it('normaliza el correo y acota la contraseña', () => {
    expect(recoveryEmailSchema.parse(' Persona@UTS.EDU.CO ')).toBe('persona@uts.edu.co');
    expect(recoveryPasswordSchema.safeParse('1234567').success).toBe(false);
    expect(recoveryPasswordSchema.safeParse('x'.repeat(129)).success).toBe(false);
  });

  it('acepta devCode solo como campo opcional del backend', () => {
    expect(recoveryRequestSchema.parse({ ok: true, message: 'ok' }).devCode).toBeUndefined();
    expect(recoveryRequestSchema.parse({ ok: true, message: 'ok', devCode: '123456' }).devCode).toBe('123456');
  });
});
