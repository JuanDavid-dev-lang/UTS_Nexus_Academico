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

export function signAccessToken(payload: JwtPayload) {
  const options: SignOptions = { expiresIn: env.ACCESS_TOKEN_TTL as SignOptions['expiresIn'] };
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, options);
}

export function signRefreshToken(payload: JwtPayload) {
  const options: SignOptions = { expiresIn: env.REFRESH_TOKEN_TTL as SignOptions['expiresIn'] };
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, options);
}

export function verifyAccessToken(token: string) {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as JwtPayload;
}

export function verifyRefreshToken(token: string) {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as JwtPayload;
}
