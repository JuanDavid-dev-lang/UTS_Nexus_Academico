/**
 * Hasta cuándo dura un semestre. Lógica pura, sin I/O.
 *
 * Sirve para una sola cosa hoy: saber hasta cuándo queda fijo el enlace de
 * UniPlanner de quien marca asistencia por QR. El enlace se ata al semestre y
 * no a un plazo fijo: el código con el que un estudiante marcó en agosto tiene
 * que seguir siendo el suyo hasta que acaben las habilitaciones, y en
 * vacaciones —cuando no hay clases que marcar— puede cambiarlo si le hace
 * falta.
 *
 * **La fecha buena es la del acuerdo del Consejo Académico**, y la pone la
 * administración en cada periodo (`AcademicPeriod.endsOn`). Sin ella se usa
 * una por defecto que cubre el calendario de la UTS con margen:
 *
 * | Periodo | UTS 2026 (acuerdo)                                   | Por defecto |
 * |---------|------------------------------------------------------|-------------|
 * | `-1`    | clases 9 feb – 6 jun; notas de habilitación hasta 26 jun | 30 de junio |
 * | `-2`    | clases 10 ago – 28 nov; notas de habilitación hasta 17 dic | 20 de diciembre |
 *
 * Fuentes: Acuerdos 03-052 (2026-1) y 03-024 (2026-2) del Consejo Académico de
 * las UTS. Otras universidades del país terminan parecido —la Nacional estiró
 * su primer semestre de 2026 hasta el 25 de julio—, y por eso la fecha por
 * defecto es solo el último recurso: cada institución pone la suya.
 */
import { esFechaReal } from '../uniplanner/message.js';
import { esPeriodoValido } from './period-lifecycle.js';

const MS_MINUTO = 60_000;
const MS_DIA = 24 * 60 * MS_MINUTO;

/**
 * Cuánto queda fijo el enlace cuando no se sabe cuándo termina el semestre:
 * un periodo sin fecha por defecto (`-3`, `-4`: intersemestrales) o una clase
 * dictada después del cierre.
 */
export const DIAS_DE_BLOQUEO_SIN_CALENDARIO = 30;

/** Último día por defecto de cada ciclo, `MM-DD`. Solo los dos semestres. */
const FIN_POR_DEFECTO: Record<string, string> = {
  '1': '06-30',
  '2': '12-20',
};

/** El último día del periodo por defecto (`AAAA-MM-DD`), o `null` si no hay. */
export function finDePeriodoPorDefecto(periodo: string): string | null {
  if (!esPeriodoValido(periodo)) return null;
  const [anio, ciclo] = periodo.split('-') as [string, string];
  const mesDia = FIN_POR_DEFECTO[ciclo];
  return mesDia ? `${anio}-${mesDia}` : null;
}

/** Si un `AAAA-MM-DD` es un día real. Para validar lo que escribe la administración. */
export function esFinDePeriodoValido(valor: unknown): valor is string {
  return typeof valor === 'string' && esFechaReal(valor);
}

/**
 * El último instante de un día del campus: `23:59:59.999` en su zona.
 *
 * El día entero cuenta: el enlace sigue fijo mientras dure el último día de
 * habilitaciones, no hasta la medianoche de su comienzo.
 */
export function finDelDiaEnElCampus(dia: string, offsetMinutos: number): Date {
  const [anio, mes, diaDelMes] = dia.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(anio, mes - 1, diaDelMes + 1) - offsetMinutos * MS_MINUTO - 1);
}

/**
 * Hasta cuándo queda fijo el enlace de quien marca asistencia ahora en una
 * clase de `periodo`.
 *
 * El fin configurado manda; si no hay, el de por defecto. Si ese día ya pasó
 * —una clase dictada después del cierre, un periodo intersemestral sin fecha—
 * se da un plazo fijo en vez de no fijar nada: marcar asistencia con un código
 * tiene que atarlo a él un tiempo, sea cuando sea.
 */
export function finDelBloqueo(datos: {
  periodo: string;
  /** `AcademicPeriod.endsOn`, si la administración lo puso. */
  finConfigurado: string | null | undefined;
  ahora: Date;
  offsetMinutos: number;
}): Date {
  const dia = esFinDePeriodoValido(datos.finConfigurado)
    ? datos.finConfigurado
    : finDePeriodoPorDefecto(datos.periodo);

  if (dia) {
    const fin = finDelDiaEnElCampus(dia, datos.offsetMinutos);
    if (fin.getTime() > datos.ahora.getTime()) return fin;
  }
  return new Date(datos.ahora.getTime() + DIAS_DE_BLOQUEO_SIN_CALENDARIO * MS_DIA);
}

/**
 * Si hay que escribir el bloqueo de un enlace que acaba de marcar.
 *
 * Solo si el que tiene se queda corto: el fin del semestre es el mismo para
 * todas las clases, así que se escribe **una vez por semestre** y estudiante,
 * no en cada clase. Una hora de margen para que un reloj un poco distinto no
 * haga reescribir la misma fecha.
 */
export function debeRenovarBloqueo(actual: Date | null, objetivo: Date): boolean {
  if (!actual || Number.isNaN(actual.getTime())) return true;
  return actual.getTime() < objetivo.getTime() - 60 * MS_MINUTO;
}
