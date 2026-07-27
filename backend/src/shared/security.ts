import crypto from 'node:crypto';

export function hashToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function daysFromNow(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

