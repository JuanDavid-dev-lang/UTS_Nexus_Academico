import { z } from 'zod';
import { paginaResponse } from './common';

/** Respuestas de `GET /uso/*` (solo ADMIN). Estadística interna; no se publica. */

export const filaRankingUsoSchema = z.object({
  userId: z.string(),
  posicion: z.number(),
  nombre: z.string(),
  correo: z.string().default(''),
  rol: z.string().default(''),
  institucion: z.string().nullable().default(null),
  diasActivos: z.number(),
  minutos: z.number(),
  peticiones: z.number(),
  ultimaActividad: z.string(),
});
export type FilaRankingUso = z.infer<typeof filaRankingUsoSchema>;

export const resumenUsoSchema = z.object({
  ok: z.literal(true),
  desde: z.string(),
  hasta: z.string(),
  hoy: z.string(),
  recientes: z.object({ hoy: z.number(), semana: z.number(), mes: z.number() }),
  totales: z.object({ usuarios: z.number(), minutos: z.number(), peticiones: z.number() }),
  activosPorDia: z.array(z.object({ dia: z.string(), usuarios: z.number() })),
  porCliente: z.array(z.object({ cliente: z.string(), usuarios: z.number(), peticiones: z.number() })),
  porRol: z.array(
    z.object({ rol: z.string(), usuarios: z.number(), minutos: z.number(), peticiones: z.number() }),
  ),
});
export type ResumenUso = z.infer<typeof resumenUsoSchema>;

export const rankingUsoSchema = paginaResponse(filaRankingUsoSchema);
