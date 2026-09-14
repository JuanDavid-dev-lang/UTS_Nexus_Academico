import { z } from 'zod';

/**
 * Puente con UniPlanner, la app del estudiante.
 *
 * Aquí solo se escribe hacia allá. No hay ningún esquema para traer datos
 * suyos porque no hay ninguna ruta que los traiga — sus notas simuladas, su
 * presupuesto y su agenda personal no son asunto de esta aplicación. Lo único
 * que vuelve es la marca de un QR de asistencia, y la lee el servidor, no este
 * cliente (`attendance-qr.ts`).
 */

export const estadoUniPlannerSchema = z.object({
  ok: z.literal(true),
  /** Si hay credenciales. Sin ellas no se pinta ni la insignia ni el botón. */
  configurado: z.boolean(),
  soloVerificados: z.boolean(),
});

export const enlaceUniPlannerSchema = z.object({
  studentId: z.string(),
  code: z.string(),
  enlazado: z.boolean(),
  /** Si la institución confirmó que ese código es de esa persona. */
  verificado: z.boolean(),
  /**
   * Semáforo de inasistencias, calculado por el servidor.
   *
   * No se deriva aquí del porcentaje que ya pinta la fila: es la misma cifra
   * que decide a quién alcanza el envío masivo, y dos cuentas distintas
   * dejarían a alguien en verde recibiendo el aviso de los que están en
   * riesgo.
   */
  nivel: z.enum(['VERDE', 'AMARILLO', 'ROJO']),
});

export const resultadoDestinatarioSchema = z.object({
  studentId: z.string(),
  code: z.string(),
  fullName: z.string(),
  enviado: z.boolean(),
  motivo: z
    .enum([
      'sin-enlace',
      'sin-verificar',
      'sin-configurar',
      'sin-token',
      'rechazado',
      'red',
      'sin-datos',
      'sin-institucion',
    ])
    .optional(),
});

export const envioUniPlannerSchema = z.object({
  ok: z.literal(true),
  total: z.number(),
  enviados: z.number(),
  omitidos: z.number(),
  resultados: z.array(resultadoDestinatarioSchema),
});

export type EstadoUniPlanner = z.infer<typeof estadoUniPlannerSchema>;
export type EnlaceUniPlanner = z.infer<typeof enlaceUniPlannerSchema>;
export type ResultadoDestinatario = z.infer<typeof resultadoDestinatarioSchema>;
export type EnvioUniPlanner = z.infer<typeof envioUniPlannerSchema>;

/** Por qué no le llegó a alguien, en una frase que el docente pueda leer. */
export const MOTIVOS: Record<NonNullable<ResultadoDestinatario['motivo']>, string> = {
  'sin-enlace': 'No tiene UniPlanner enlazado',
  'sin-verificar': 'Su enlace no está confirmado',
  'sin-configurar': 'El puente no está configurado',
  'sin-token': 'No se pudo autenticar con UniPlanner',
  rechazado: 'UniPlanner rechazó el aviso',
  red: 'No hubo conexión con UniPlanner',
  'sin-datos': 'No hay dato que publicar todavía',
  'sin-institucion': 'La materia no tiene perfil institucional configurado',
};

// ── Vínculos: gestión institucional ─────────────────────────────────────────
//
// El enlace es de la persona con su universidad, no de un curso: lo gestiona
// administración o coordinación (secretaría lo consulta), una vez para todas
// las materias del estudiante.

export const institucionGestionableSchema = z.object({
  institutionId: z.string(),
  nombre: z.string(),
  sigla: z.string(),
});

const estudianteDeVinculoSchema = z.object({
  id: z.string(),
  fullName: z.string(),
  code: z.string(),
  program: z.string(),
  email: z.string().nullable(),
});

export const vinculoSchema = z.object({
  linkId: z.string(),
  codigo: z.string(),
  /** `false` en una búsqueda: el estudiante existe y no tiene UniPlanner. */
  enlazado: z.boolean(),
  verificado: z.boolean(),
  verificadoEn: z.string().nullable(),
  /** Fijo el semestre porque marcó asistencia con él. `null` si no lo está. */
  bloqueadoHasta: z.string().nullable(),
  enlazadoEn: z.string().nullable(),
  /** Cómo está la verificación; opcional para servidores anteriores. */
  verificacion: z
    .enum(['automatica', 'manual', 'no_coincide', 'pendiente', 'sin_nombre'])
    .nullable()
    .optional()
    .default(null),
  /** El nombre que escribió la persona en UniPlanner. */
  nombreEnUniPlanner: z.string().nullable().optional().default(null),
  /** `null` si el documento no es de ningún estudiante de Nexus. */
  estudiante: estudianteDeVinculoSchema.nullable(),
});

export const paginaVinculosSchema = z.object({
  ok: z.literal(true),
  items: z.array(vinculoSchema),
  siguiente: z.string().nullable(),
});

export const accionSolicitudSchema = z.enum(['desbloquear', 'liberar', 'asignar', 'rechazar']);

export const solicitudSchema = z.object({
  uid: z.string(),
  /** `unlock`: se equivocó de código; `claimed`: su código lo tiene otra cuenta. */
  tipo: z.enum(['unlock', 'claimed']),
  codigo: z.string(),
  motivo: z.string(),
  creadaEn: z.string().nullable(),
  estudiante: estudianteDeVinculoSchema.nullable(),
  enlace: z.object({
    existe: z.boolean(),
    esDeQuienPide: z.boolean(),
    verificado: z.boolean(),
    bloqueadoHasta: z.string().nullable(),
  }),
  acciones: z.array(accionSolicitudSchema),
});

export type InstitucionGestionable = z.infer<typeof institucionGestionableSchema>;
export type Vinculo = z.infer<typeof vinculoSchema>;
export type Solicitud = z.infer<typeof solicitudSchema>;
export type AccionSolicitud = z.infer<typeof accionSolicitudSchema>;
export type AccionVinculo = 'verificar' | 'desverificar' | 'desbloquear' | 'liberar';
export type FiltroVinculos = 'todos' | 'sin-verificar' | 'verificados' | 'fijos';

