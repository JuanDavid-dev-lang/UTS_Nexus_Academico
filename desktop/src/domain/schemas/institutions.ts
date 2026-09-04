/**
 * Perfiles institucionales.
 *
 * Una institución deja de ser un texto libre («UTS» tecleado a mano en cada
 * formulario) y pasa a ser un perfil con identificador estable, alias por los
 * que se la reconoce y, opcionalmente, sus propios cortes y ponderados. UIS y
 * UDES nacen sin `configuracionAcademica`: es el administrador quien la
 * define, nunca un valor por defecto inventado en el cliente.
 */
import { z } from 'zod';
import { objectId } from './common';

export const institucionPublicaSchema = z.object({
  id: objectId,
  institutionId: z.string(),
  nombre: z.string(),
  sigla: z.string(),
});
export type InstitucionPublica = z.infer<typeof institucionPublicaSchema>;

export const corteConfigSchema = z.object({
  numero: z.number(),
  nombre: z.string(),
  /** Fracción 0–1. La suma de todos los cortes tiene que dar 1 (tolerancia 0.001), lo valida el backend. */
  peso: z.number(),
});
export type CorteConfig = z.infer<typeof corteConfigSchema>;

export const componenteConfigSchema = z.object({
  /** MAYÚSCULAS: TRABAJOS, PARCIALES, AUTOEVALUACION… */
  id: z.string(),
  nombre: z.string(),
  peso: z.number(),
});
export type ComponenteConfig = z.infer<typeof componenteConfigSchema>;

export const configuracionAcademicaSchema = z.object({
  cortes: z.array(corteConfigSchema).default([]),
  componentes: z.array(componenteConfigSchema).default([]),
  notaMinima: z.number(),
  notaMaxima: z.number(),
  notaAprobacion: z.number(),
});
export type ConfiguracionAcademica = z.infer<typeof configuracionAcademicaSchema>;

export const institucionSchema = institucionPublicaSchema.extend({
  aliases: z.array(z.string()).default([]),
  activa: z.boolean().default(true),
  /** `null` = sin configurar. No es un estado transitorio: UIS y UDES viven así hasta que un administrador la define. */
  configuracionAcademica: configuracionAcademicaSchema.nullable().default(null),
  configuradaEn: z.string().nullable().default(null),
  /** Conteo de docentes vinculados. Presente en listado y ficha, ausente en la forma pública del registro. */
  docentes: z.number().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type Institucion = z.infer<typeof institucionSchema>;

export const estadoDocenteInstitucion = z.enum(['PENDIENTE', 'APROBADO', 'RECHAZADO']);

export const docenteInstitucionSchema = z.object({
  id: objectId,
  userId: z.string().default(''),
  cedula: z.string().nullable().default(null),
  nombre: z.string().default(''),
  email: z.string().default(''),
  // Fichas anteriores al autorregistro no traen `estado`; un valor raro en una
  // fila no debe tumbar la lista entera (así se vio «Sin docentes» con 6).
  estado: estadoDocenteInstitucion.catch('APROBADO'),
  programas: z.array(z.string()).default([]),
  institucionSolicitada: z.string().nullable().default(null),
});
export type DocenteInstitucion = z.infer<typeof docenteInstitucionSchema>;

export const coincidenciaSchema = z.object({
  perfil: institucionPublicaSchema.extend({ activa: z.boolean() }),
  tipo: z.enum(['exacta', 'posible']),
  motivo: z.string(),
});
export type Coincidencia = z.infer<typeof coincidenciaSchema>;

/** Solicitud: un docente pidió una institución que todavía no existe como perfil. */
export const solicitudInstitucionSchema = docenteInstitucionSchema.extend({
  institucionSolicitada: z.string(),
  coincidencias: z.array(coincidenciaSchema).default([]),
  solicitadaEn: z.string().optional(),
});
export type SolicitudInstitucion = z.infer<typeof solicitudInstitucionSchema>;
