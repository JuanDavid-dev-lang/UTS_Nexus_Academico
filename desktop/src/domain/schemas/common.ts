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

/**
 * Referencia que puede llegar poblada, normalizada SIEMPRE al id.
 *
 * `populate()` de Mongoose entrega el documento en lugar del id, y una
 * referencia colgante llega como null. Rechazar esas formas en el esquema no
 * da un error visible: tumba el parse del array entero y la pantalla se queda
 * vacía en silencio — ya pasó con las matrículas. Este es el normalizador
 * canónico para «quiero el id»; `autorAviso` y `usuarioPoblado` existen para
 * lo contrario (conservar la identidad poblada) y no son copias de esto.
 *
 * Una referencia nula u opaca produce '' y el llamador decide si filtra la
 * fila; nunca revienta la lista completa.
 */
export const refId = z.union([
  objectId,
  z
    .object({ _id: objectId.optional(), id: objectId.optional() })
    .transform((doc) => doc._id ?? doc.id ?? ''),
  z.null().transform(() => ''),
]);

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

/**
 * Roles, en orden de autoridad decreciente.
 *
 * `SECRETARY` ve exactamente lo mismo que `COORDINATOR` en sus programas y no
 * escribe nada. Esa diferencia se modela en `core/auth/permissions.ts`, no aquí:
 * este esquema solo tiene que aceptar el valor que manda el servidor. Un rol
 * que falte en la lista no da un error entendible — tumba el parse de la sesión
 * entera y la aplicación se queda en la pantalla de acceso.
 */
export const role = z.enum(['ADMIN', 'COORDINATOR', 'SECRETARY', 'PROFESSOR', 'STUDENT']);
export type Role = z.infer<typeof role>;
