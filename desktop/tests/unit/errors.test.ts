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

  // ── El 403 del registro de docentes ──────────────────────────────────────
  //
  // El login responde 403 cuando la cuenta existe pero su registro está en
  // revisión o rechazado, y ese texto sí está escrito para la persona. Antes se
  // descartaba con el resto de los 403: el docente pendiente leía «No tienes
  // permisos», que parece una avería, y el motivo del rechazo no salía nunca
  // aunque el panel de administración prometa que lo verá al intentar entrar.

  it('muestra el mensaje de un registro en revisión', () => {
    const error = appErrorFromResponse(403, {
      ok: false,
      estado: 'PENDIENTE',
      message: 'Tu registro está en revisión. Te avisaremos cuando lo aprueben.',
    });
    expect(error.message).toBe('Tu registro está en revisión. Te avisaremos cuando lo aprueben.');
    expect(error.kind).toBe('forbidden');
  });

  it('muestra el motivo del rechazo aunque lleve texto que parece interno', () => {
    // El motivo lo teclea la administración: un guion bajo o la palabra «Error»
    // dentro habría bastado para tumbarlo al mensaje genérico.
    const error = appErrorFromResponse(403, {
      ok: false,
      estado: 'RECHAZADO',
      message: 'Tu registro fue rechazado: Error en el código_docente.',
    });
    expect(error.message).toContain('Error en el código_docente.');
  });

  it('acota el motivo largo en vez de descartarlo', () => {
    const largo = 'x'.repeat(600);
    const error = appErrorFromResponse(403, { estado: 'RECHAZADO', message: largo });
    expect(error.message).toHaveLength(400);
  });

  it('un 403 sin estado sigue mostrando el mensaje genérico', () => {
    // Es el 403 de `requireRole`, cuyo texto es interno.
    const error = appErrorFromResponse(403, { ok: false, message: 'Forbidden' });
    expect(error.message).toBe('No tienes permisos para realizar esta acción.');
  });

  it('un estado desconocido no abre la puerta', () => {
    const error = appErrorFromResponse(403, { estado: 'CUALQUIERA', message: 'texto interno' });
    expect(error.message).toBe('No tienes permisos para realizar esta acción.');
  });

  it('el estado solo vale en un 403, no en un 401', () => {
    const error = appErrorFromResponse(401, { estado: 'PENDIENTE', message: 'texto interno' });
    expect(error.message).toBe('Tu sesión expiró. Vuelve a iniciar sesión.');
  });

  it('un estado sin mensaje cae al genérico sin reventar', () => {
    const error = appErrorFromResponse(403, { estado: 'PENDIENTE' });
    expect(error.message).toBe('No tienes permisos para realizar esta acción.');
  });
});
