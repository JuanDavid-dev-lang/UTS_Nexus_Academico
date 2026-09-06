import { z } from 'zod';

/**
 * Puente con UniPlanner, la app del estudiante.
 *
 * El canal es de una sola dirección: aquí solo se escribe hacia allá. No hay
 * ningún esquema para traer datos suyos porque no hay ninguna ruta que los
 * traiga — sus notas simuladas, su presupuesto y su agenda personal no son
 * asunto de esta aplicación.
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
