import { z } from 'zod';

/**
 * Asistencia por QR escaneado desde UniPlanner.
 *
 * El escritorio solo abre la clase, pinta el QR que le da el servidor y enseña
 * quién va marcando. **No decide nada**: ni si una marca vale, ni quién es el
 * estudiante, ni cuánto falta para cerrar. Lo primero lo decide el servidor
 * con el secreto de la sesión; lo último también, porque el reloj del equipo
 * del aula no tiene por qué ir bien.
 */

export const alumnoSesionQrSchema = z.object({
  studentId: z.string(),
  fullName: z.string(),
  code: z.string(),
  photoUrl: z.string().nullable(),
  /** Si tiene UniPlanner enlazado: sin eso no puede marcar por QR. */
  enlazado: z.boolean(),
  /**
   * `CONFIRMANDO`: escaneó, vio su nombre y su clase en UniPlanner y falta que
   * pulse «Confirmar». Hasta entonces no hay asistencia escrita.
   */
  estado: z.enum(['PRESENTE', 'CONFIRMANDO', 'SIN_MARCA']),
  marcadaEn: z.string().nullable(),
});

export const rechazoQrSchema = z.object({
  /** Texto y no enum: un motivo nuevo del servidor no debe tumbar la pantalla. */
  motivo: z.string(),
  mensaje: z.string(),
  fullName: z.string().nullable(),
  creadaEn: z.string(),
});

export const sesionQrSchema = z.object({
  id: z.string(),
  estado: z.enum(['ABIERTA', 'CERRADA']),
  subjectId: z.string(),
  subjectName: z.string(),
  subjectCode: z.string(),
  grupo: z.string(),
  hora: z.string(),
  period: z.string(),
  date: z.string(),
  abiertaEn: z.string(),
  cierraEn: z.string(),
  cerradaEn: z.string().nullable(),
  motivoCierre: z.enum(['DOCENTE', 'VENCIDA', 'PERIODO']).nullable(),
  marcarAusentes: z.boolean(),
  ausentesMarcados: z.number(),
  /** Milisegundos que le quedan, contados por el servidor al responder. */
  restanteMs: z.number(),
  resumen: z.object({
    matriculados: z.number(),
    conUniPlanner: z.number(),
    presentes: z.number(),
    confirmando: z.number().default(0),
    rechazadas: z.number(),
  }),
  alumnos: z.array(alumnoSesionQrSchema),
  rechazos: z.array(rechazoQrSchema),
});

export const sesionQrResponse = z.object({ ok: z.literal(true), item: sesionQrSchema });

export const aperturaQrResponse = z.object({
  ok: z.literal(true),
  /** `true` si la materia ya tenía una sesión abierta y se devolvió esa. */
  existente: z.boolean(),
  item: sesionQrSchema,
});

export const sesionesAbiertasQrResponse = z.object({
  ok: z.literal(true),
  items: z.array(z.object({ id: z.string(), subjectId: z.string(), groupId: z.string().nullable() })),
});

export const qrVigenteSchema = z.object({
  ok: z.literal(true),
  contenido: z.string(),
  /** Cuándo pedir el siguiente, relativo a la respuesta: no depende del reloj local. */
  refrescarEnMs: z.number(),
  segundosPorVentana: z.number(),
});

export type SesionQr = z.infer<typeof sesionQrSchema>;
export type AlumnoSesionQr = z.infer<typeof alumnoSesionQrSchema>;
export type QrVigente = z.infer<typeof qrVigenteSchema>;

/** Los minutos que se ofrecen al abrir. El servidor acepta de 5 a 120. */
export const MINUTOS_QR = [5, 10, 15, 20, 30, 45, 60, 90, 120] as const;
