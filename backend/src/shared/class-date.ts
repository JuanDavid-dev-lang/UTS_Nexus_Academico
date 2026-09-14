/**
 * La fecha de clase con la zona del campus ya puesta.
 *
 * `domains/attendance/class-date.ts` es puro y recibe el desfase como
 * argumento; esto lo ata a `CAMPUS_UTC_OFFSET_MIN` para las rutas. Toda ruta
 * que escriba `Asistencia.date` valida con `campoFechaDeClase`: si una se
 * saltara la normalización, la misma clase volvería a ser dos documentos.
 */
import { z } from 'zod';
import { env } from './env.js';
import {
  diaDeCampus,
  instanteDeClase,
  normalizarFechaDeClase,
} from '../domains/attendance/class-date.js';

/**
 * Campo Zod para la fecha de una clase.
 *
 * Lo que no dice un día real se deja pasar sin tocar para que `z.date()` lo
 * rechace con un 400 que nombra el campo, en vez de convertirse en `null` y
 * guardarse como otra cosa.
 */
export const campoFechaDeClase = z.preprocess(
  (valor) => normalizarFechaDeClase(valor, env.CAMPUS_UTC_OFFSET_MIN) ?? valor,
  z.date({ invalid_type_error: 'Fecha de clase inválida: usa AAAA-MM-DD.' }),
);

/** El día de hoy en el campus, `AAAA-MM-DD`. */
export function hoyEnElCampus(ahora = new Date()): string {
  return diaDeCampus(ahora, env.CAMPUS_UTC_OFFSET_MIN);
}

/** La fecha canónica de la clase de un día del campus. */
export function fechaDeClaseDelDia(dia: string): Date {
  return instanteDeClase(dia, env.CAMPUS_UTC_OFFSET_MIN);
}
