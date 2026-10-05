/**
 * Validación de la cola leída del disco.
 *
 * Lo guardado en el almacén local es entrada no confiable: pudo escribirlo una
 * versión anterior con otra forma, o dañarse. Una entrada que no cuadra se
 * descarta una a una —no la cola entera— y se cuenta, para poder avisar.
 */
import { z } from 'zod';
import { gradeInputSchema } from '@/domain/schemas/grades';
import type { OutboxEntry } from './outbox';

const registro = z.object({
  studentId: z.string().min(1),
  present: z.boolean(),
  lateMinutes: z.number(),
  notes: z.string(),
});

const clase = z.object({
  subjectId: z.string().min(1),
  groupId: z.string().optional(),
  teacherId: z.string().min(1),
  period: z.string(),
  dia: z.string(),
  date: z.string(),
});

const datos = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('grade.upsert'), input: gradeInputSchema }),
  z.object({ kind: z.literal('grade.delete'), gradeId: z.string().min(1), etiqueta: z.string() }),
  z.object({
    kind: z.literal('attendance.class'),
    clase,
    registros: z.array(registro).min(1),
  }),
]);

export const outboxEntrySchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  createdAt: z.number(),
  kind: z.enum(['grade.upsert', 'grade.delete', 'attendance.class']),
  clave: z.string().min(1),
  method: z.enum(['POST', 'DELETE']),
  path: z.string().startsWith('/'),
  body: z.record(z.unknown()).nullable(),
  estado: z.enum(['pendiente', 'enviando', 'fallida']),
  intentos: z.number(),
  ultimoError: z.string().nullable(),
  proximoIntento: z.number().nullable(),
  datos,
  resumen: z.string(),
});

/** Las entradas válidas de un valor leído del disco, y cuántas se descartaron. */
export function leerCola(valor: unknown): { entradas: OutboxEntry[]; descartadas: number } {
  if (!Array.isArray(valor)) return { entradas: [], descartadas: 0 };
  const entradas: OutboxEntry[] = [];
  let descartadas = 0;
  for (const item of valor) {
    const parsed = outboxEntrySchema.safeParse(item);
    if (parsed.success) entradas.push(parsed.data as OutboxEntry);
    else descartadas += 1;
  }
  return { entradas, descartadas };
}
