import { describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import type { Request, Response } from 'express';
import { errorHandler } from '../src/shared/error.js';

/**
 * Respuesta falsa: guarda el estado y el cuerpo con los que se contestó.
 */
function respuesta() {
  const res = { status: 0, body: undefined as unknown };
  const fake = {
    status(code: number) {
      res.status = code;
      return fake;
    },
    json(body: unknown) {
      res.body = body;
      return fake;
    },
  } as unknown as Response;
  return { fake, res };
}

function traducir(err: unknown) {
  const { fake, res } = respuesta();
  errorHandler(err, {} as Request, fake, () => {});
  return res;
}

describe('errorHandler', () => {
  it('un token vencido es 401, no 500', () => {
    const vencido = jwt.sign({ sub: 'x' }, 'secreto', { expiresIn: -10 });
    let capturado: unknown;
    try {
      jwt.verify(vencido, 'secreto');
    } catch (err) {
      capturado = err;
    }
    expect(capturado).toBeInstanceOf(jwt.TokenExpiredError);

    const res = traducir(capturado);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ ok: false, message: 'Invalid session' });
  });

  it('un token mal firmado o mal formado también es 401', () => {
    for (const token of ['no-es-un-jwt', jwt.sign({ sub: 'x' }, 'otro-secreto')]) {
      let capturado: unknown;
      try {
        jwt.verify(token, 'secreto');
      } catch (err) {
        capturado = err;
      }
      expect(traducir(capturado).status).toBe(401);
    }
  });

  it('un error sin statusCode sigue siendo 500 y no filtra el detalle', () => {
    const silenciar = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = traducir(new Error('detalle interno con la cadena de conexión'));
    silenciar.mockRestore();

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ ok: false, message: 'Internal server error' });
  });

  it('un error con statusCode se respeta', () => {
    const res = traducir(Object.assign(new Error('No encontrado'), { statusCode: 404 }));
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ ok: false, message: 'No encontrado' });
  });
});
