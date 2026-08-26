/**
 * Catálogo institucional y autorregistro de docentes.
 */
import { z } from 'zod';
import { mongoDoc } from './common';

// ── Catálogo institucional y registro de docentes ───────────────────────────

export const sedeId = z.enum(['BUCARAMANGA', 'PIEDECUESTA', 'VELEZ', 'BARRANCABERMEJA']);
export const facultadId = z.enum(['SOCIOECONOMICAS', 'NATURALES_INGENIERIAS']);
export const nivelId = z.enum(['TECNOLOGICO', 'PROFESIONAL']);

export type SedeId = z.infer<typeof sedeId>;
export type FacultadId = z.infer<typeof facultadId>;
export type NivelId = z.infer<typeof nivelId>;

export const programaSchema = z.object({
  id: z.string(),
  nombre: z.string(),
  facultad: facultadId,
  nivel: nivelId,
});
export type Programa = z.infer<typeof programaSchema>;

const opcion = z.object({ id: z.string(), nombre: z.string() });

/**
 * Área académica: la carrera completa.
 *
 * En las UTS el ciclo tecnológico continúa en el profesional sobre la misma
 * línea, así que coordinar «Sistemas» es coordinar los dos títulos. Se elige
 * por área; lo que se guarda siguen siendo los ids de programa.
 */
export const areaSchema = z.object({
  id: z.string(),
  nombre: z.string(),
  facultad: facultadId,
  programas: z.array(z.string()),
});
export type Area = z.infer<typeof areaSchema>;

/** Lo que necesita el formulario de registro. Se sirve sin autenticación. */
export const catalogoSchema = z.object({
  ok: z.literal(true),
  abierto: z.boolean(),
  sedes: z.array(opcion),
  facultades: z.array(opcion),
  niveles: z.array(opcion),
  programas: z.array(programaSchema),
  // Opcional: un backend anterior a las áreas no las manda, y la pantalla cae
  // a la lista de programas sueltos en vez de quedarse en blanco.
  areas: z.array(areaSchema).default([]),
});
export type Catalogo = z.infer<typeof catalogoSchema>;

export const solicitudRegistroSchema = z.object({
  cedula: z.string().regex(/^\d{6,10}$/, 'La cédula debe tener entre 6 y 10 dígitos'),
  nombres: z.string().min(2, 'Escribe tus nombres'),
  apellidos: z.string().min(2, 'Escribe tus apellidos'),
  sede: sedeId,
  facultad: facultadId,
  niveles: z.array(nivelId).min(1, 'Marca al menos un nivel'),
  programas: z.array(z.string()).min(1, 'Elige al menos un programa'),
  email: z.string().email('Correo inválido'),
  password: z
    .string()
    .min(10, 'Mínimo 10 caracteres')
    .regex(/[a-z]/, 'Incluye una minúscula')
    .regex(/[A-Z]/, 'Incluye una mayúscula')
    .regex(/\d/, 'Incluye un número'),
});
export type SolicitudRegistro = z.infer<typeof solicitudRegistroSchema>;

/** Solicitud tal como la ve quien la revisa. */
export const solicitudSchema = mongoDoc.extend({
  cedula: z.string().nullable().optional(),
  nombres: z.string().optional().default(''),
  apellidos: z.string().optional().default(''),
  sede: z.string().nullable().optional(),
  facultad: z.string().nullable().optional(),
  niveles: z.array(z.string()).optional().default([]),
  programas: z.array(z.string()).optional().default([]),
  estado: z.enum(['PENDIENTE', 'APROBADO', 'RECHAZADO']),
  motivoRechazo: z.string().optional().default(''),
  userId: z
    .object({ _id: z.string(), email: z.string(), fullName: z.string() })
    .partial()
    .nullable()
    .optional(),
});
export type Solicitud = z.infer<typeof solicitudSchema>;
