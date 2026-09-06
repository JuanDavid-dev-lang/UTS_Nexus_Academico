import jwt from 'jsonwebtoken';
import { env } from './env.js';
import type { SignOptions } from 'jsonwebtoken';
import type { Role } from './types.js';

export type JwtPayload = {
  sub: string;
  role: Role;
  tenantId?: string;
  /** Presente solo para role === 'STUDENT': id del documento Estudiante vinculado. */
  studentId?: string;
};

/**
 * El algoritmo se fija al firmar **y al verificar**.
 *
 * `jsonwebtoken` 9 ya rechaza `alg: none` cuando el secreto es una cadena, así
 * que hoy no hay nada explotable aquí. Declararlo igualmente cierra la familia
 * entera de sorpresas —la que aparece el día que alguien pase a claves
 * asimétricas y el verificador siga aceptando lo que le manden— y cuesta una
 * línea. `verify` con `algorithms` no acepta un token firmado con otro.
 */
const ALGORITMO = 'HS256' as const;

export function signAccessToken(payload: JwtPayload) {
  const options: SignOptions = {
    algorithm: ALGORITMO,
    expiresIn: env.ACCESS_TOKEN_TTL as SignOptions['expiresIn'],
  };
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, options);
}

export function signRefreshToken(payload: JwtPayload) {
  const options: SignOptions = {
    algorithm: ALGORITMO,
    expiresIn: env.REFRESH_TOKEN_TTL as SignOptions['expiresIn'],
  };
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, options);
}

export function verifyAccessToken(token: string) {
  return jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: [ALGORITMO] }) as JwtPayload;
}

export function verifyRefreshToken(token: string) {
  return jwt.verify(token, env.JWT_REFRESH_SECRET, { algorithms: [ALGORITMO] }) as JwtPayload;
}
