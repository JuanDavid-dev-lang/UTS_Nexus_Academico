/**
 * Shared response shapes.
 *
 * Every API endpoint answers with `{ ok: true, ... }`, so the envelope is
 * modelled once here instead of being repeated in each schema.
 *
 * Schemas describe only the fields the client actually consumes. Zod strips
 * unknown keys by default, so the backend can add fields without breaking us -
 * but it can never silently remove one we depend on.
 */
import { z } from 'zod';

/** Mongo ObjectId serialised as a string. */
export const objectId = z.string().min(1);

/** Mongoose documents expose `_id`; some aggregated endpoints expose `id`. */
export const mongoDoc = z.object({
  _id: objectId,
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export function itemsResponse<T extends z.ZodTypeAny>(item: T) {
  return z.object({ ok: z.literal(true), items: z.array(item) });
}

export function itemResponse<T extends z.ZodTypeAny>(item: T) {
  return z.object({ ok: z.literal(true), item });
}

export const okResponse = z.object({ ok: z.literal(true) });

/**
 * Coerces a numeric field that the API may send as a string.
 *
 * Mongo aggregations occasionally return numbers as strings; being strict here
 * would turn a cosmetic difference into a hard failure.
 */
export const numberish = z.union([z.number(), z.string()]).transform((value) => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
});

export const riskLevel = z.enum(['LOW', 'MEDIUM', 'HIGH']);
export type RiskLevel = z.infer<typeof riskLevel>;

export const riskLevelEs = z.enum(['BAJO', 'MEDIO', 'ALTO']);

export const role = z.enum(['ADMIN', 'PROFESSOR', 'COORDINATOR', 'STUDENT']);
export type Role = z.infer<typeof role>;
