import { describe, expect, it } from 'vitest';
import { AppError, appErrorFromResponse, kindFromStatus, toAppError } from '@/core/api/errors';

describe('kindFromStatus', () => {
  it('maps HTTP status codes to actionable error kinds', () => {
    expect(kindFromStatus(401)).toBe('unauthorized');
    expect(kindFromStatus(403)).toBe('forbidden');
    expect(kindFromStatus(404)).toBe('not_found');
    expect(kindFromStatus(409)).toBe('conflict');
    expect(kindFromStatus(422)).toBe('validation');
    expect(kindFromStatus(429)).toBe('rate_limited');
    expect(kindFromStatus(500)).toBe('server');
    expect(kindFromStatus(503)).toBe('server');
  });
});

describe('isRetryable', () => {
  it('only allows retrying failures that could plausibly succeed again', () => {
    expect(new AppError('network', 'x').isRetryable).toBe(true);
    expect(new AppError('timeout', 'x').isRetryable).toBe(true);
    expect(new AppError('server', 'x').isRetryable).toBe(true);

    // Retrying these just wastes the user's time - the outcome is deterministic.
    expect(new AppError('forbidden', 'x').isRetryable).toBe(false);
    expect(new AppError('validation', 'x').isRetryable).toBe(false);
    expect(new AppError('unauthorized', 'x').isRetryable).toBe(false);
  });
});

describe('toAppError', () => {
  it('treats a fetch TypeError as an unreachable server', () => {
    expect(toAppError(new TypeError('Failed to fetch')).kind).toBe('network');
  });

  it('passes AppError instances through unchanged', () => {
    const original = new AppError('conflict', 'ya existe');
    expect(toAppError(original)).toBe(original);
  });

  it('never throws on non-Error values', () => {
    expect(toAppError('boom').kind).toBe('unknown');
    expect(toAppError(null).kind).toBe('unknown');
    expect(toAppError(undefined).kind).toBe('unknown');
  });
});

describe('appErrorFromResponse', () => {
  it('uses the server message on validation and conflict statuses', () => {
    const error = appErrorFromResponse(409, { message: 'Ese código ya está registrado' });
    expect(error.message).toBe('Ese código ya está registrado');
    expect(error.kind).toBe('conflict');
  });

  it('ignores the server message on 403, which carries internal detail', () => {
    const error = appErrorFromResponse(403, { message: 'Forbidden' });
    expect(error.message).toBe('No tienes permisos para realizar esta acción.');
  });

  it('never leaks a driver error to the user', () => {
    // Real response observed when MONGODB_URI is missing: /health answers 200,
    // so the app looks healthy, and then login fails with this.
    const error = appErrorFromResponse(500, {
      ok: false,
      message: 'Operation `usuarios.findOne()` buffering timed out after 10000ms',
    });

    expect(error.message).toBe('El servidor tuvo un problema. Intenta de nuevo en unos segundos.');
    // The raw text is still available for diagnosis, just not on screen.
    expect(error.details).toMatchObject({
      message: expect.stringContaining('buffering timed out'),
    });
  });

  it('rejects internal-looking text even on a user-facing status', () => {
    const error = appErrorFromResponse(400, {
      message: 'ValidationError: path `code` is required',
    });
    expect(error.message).toBe('Revisa los datos ingresados: hay algo que no es válido.');
  });

  it('handles a body with no message at all', () => {
    expect(appErrorFromResponse(500, null).message).toContain('servidor');
  });
});
