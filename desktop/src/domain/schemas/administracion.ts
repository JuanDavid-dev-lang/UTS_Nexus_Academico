/**
 * Capacidades administrativas: periodos, auditoría, salud y telemetría.
 *
 * Los esquemas describen solo los campos que la interfaz consume. Zod descarta
 * lo desconocido, así que el backend puede añadir campos sin romper nada —pero
 * no puede quitar en silencio uno del que dependemos.
 */
import { z } from 'zod';
import { mongoDoc, numberish, riskLevelEs } from './common';

// ── Periodos académicos ─────────────────────────────────────────────────────

export const estadoPeriodo = z.enum(['OPEN', 'CLOSING', 'CLOSED']);
export type EstadoPeriodo = z.infer<typeof estadoPeriodo>;

export const periodoSchema = z.object({
  period: z.string(),
  label: z.string().default(''),
  state: estadoPeriodo.catch('OPEN'),
  closedAt: z.string().nullable().default(null),
  closedBy: z.string().nullable().default(null),
  closingStartedAt: z.string().nullable().default(null),
  snapshotVersion: numberish.default(0),
  /** Porcentaje entero, ya calculado por el backend. */
  progreso: numberish.default(0),
  progresoDetalle: z
    .object({
      total: numberish.default(0),
      done: numberish.default(0),
      lastError: z.string().nullable().default(null),
    })
    .default({ total: 0, done: 0, lastError: null }),
  snapshotSummary: z.record(numberish).default({}),
  reaperturas: numberish.default(0),
  /** `true` cuando el periodo aún no tiene documento propio (histórico). */
  implicito: z.boolean().default(false),
});
export type Periodo = z.infer<typeof periodoSchema>;

export const fotografiaSchema = mongoDoc.extend({
  period: z.string(),
  code: z.string().default(''),
  fullName: z.string().default(''),
  notaFinal: numberish.default(0),
  cortes: z.array(numberish).default([]),
  aprobado: z.boolean().default(false),
  asistenciaPorcentaje: numberish.default(0),
  riesgoNivel: riskLevelEs.catch('BAJO'),
  riesgoPuntaje: numberish.default(0),
  snapshotVersion: numberish.default(1),
  capturedAt: z.string().optional(),
});
export type Fotografia = z.infer<typeof fotografiaSchema>;

export const resultadoCierreSchema = z.object({
  ok: z.literal(true),
  period: z.string(),
  state: estadoPeriodo,
  registros: numberish,
  reanudado: z.boolean(),
  resumen: z.record(numberish).default({}),
});

// ── Auditoría ───────────────────────────────────────────────────────────────

export const registroAuditoriaSchema = z.object({
  _id: z.string(),
  createdAt: z.string().optional(),
  action: z.string(),
  entity: z.string(),
  entityId: z.string().nullable().default(null),
  actorId: z.string().nullable().default(null),
  actorNombre: z.string().nullable().default(null),
  ip: z.string().nullable().default(null),
  camposCambiados: z.array(z.string()).default([]),
});
export type RegistroAuditoria = z.infer<typeof registroAuditoriaSchema>;

export const detalleAuditoriaSchema = registroAuditoriaSchema.extend({
  userAgent: z.string().nullable().default(null),
  // `unknown`: el contenido depende de la entidad y ya viene saneado del
  // servidor. Tiparlo aquí obligaría a un esquema por cada colección.
  before: z.unknown().nullable().default(null),
  after: z.unknown().nullable().default(null),
});
export type DetalleAuditoria = z.infer<typeof detalleAuditoriaSchema>;

export const catalogoAuditoriaSchema = z.object({
  ok: z.literal(true),
  acciones: z.array(z.string()).default([]),
  entidades: z.array(z.string()).default([]),
});

// ── Centro de salud ─────────────────────────────────────────────────────────

export const estadoServicio = z.enum(['desactivado', 'configurado', 'saludable', 'error']);
export type EstadoServicio = z.infer<typeof estadoServicio>;

export const comprobacionSchema = z.object({
  clave: z.string(),
  nombre: z.string(),
  estado: estadoServicio.catch('error'),
  detalle: z.string().default(''),
  comprobadoEn: z.string(),
  enlace: z.string().optional(),
});
export type Comprobacion = z.infer<typeof comprobacionSchema>;

export const estadoTareaSchema = z.object({
  job: z.string(),
  nombre: z.string(),
  activa: z.boolean().default(false),
  intervaloMin: numberish.default(0),
  ultimaEjecucion: z.string().nullable().default(null),
  ultimoExito: z.string().nullable().default(null),
  duracionMs: numberish.default(0),
  ejecuciones: numberish.default(0),
  fallos: numberish.default(0),
  ultimoError: z.string().nullable().default(null),
  ultimoResultado: z.record(z.unknown()).default({}),
  instancia: z.string().default(''),
});
export type EstadoTarea = z.infer<typeof estadoTareaSchema>;

export const errorClienteSchema = mongoDoc.extend({
  client: z.enum(['desktop', 'mobile']),
  appVersion: z.string().default(''),
  platform: z.string().default(''),
  route: z.string().default(''),
  category: z.enum(['render', 'network', 'runtime', 'unhandled', 'promise', 'otro']).catch('otro'),
  signature: z.string(),
  message: z.string().default(''),
  context: z.string().default(''),
  occurrences: numberish.default(1),
  affectedUsers: numberish.default(1),
  firstSeenAt: z.string().optional(),
  lastSeenAt: z.string().optional(),
  status: z.enum(['ABIERTO', 'RESUELTO', 'IGNORADO']).catch('ABIERTO'),
});
export type ErrorCliente = z.infer<typeof errorClienteSchema>;

export const saludSchema = z.object({
  ok: z.literal(true),
  version: z.string().default(''),
  uptimeSegundos: numberish.default(0),
  instancia: z.string().default(''),
  avisoMultiInstancia: z.string().default(''),
  servicios: z.array(comprobacionSchema).default([]),
  tareas: z.array(estadoTareaSchema).default([]),
  riesgo: z.object({ fuente: z.enum(['model', 'rules']), detalle: z.string() }),
  errores: z
    .object({
      abiertos: numberish.default(0),
      porCliente: z.record(numberish).default({}),
      masFrecuentes: z.array(errorClienteSchema.partial().extend({ _id: z.string() })).default([]),
    })
    .default({ abiertos: 0, porCliente: {}, masFrecuentes: [] }),
});
export type Salud = z.infer<typeof saludSchema>;
