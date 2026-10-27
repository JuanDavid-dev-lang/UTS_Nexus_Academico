/**
 * Dominio de asistencia — cálculo ponderado por tiempo REAL de clase.
 *
 * Una clase de 1:30 pesa distinto que una de 3:00. El porcentaje de asistencia
 * NO se calcula por número de clases, sino por minutos: minutos presentes sobre
 * minutos totales dictados. Funciones puras y testeables.
 */

export const ASISTENCIA = {
  /** Duración por defecto si un registro no la especifica (minutos). */
  DURACION_DEFECTO: 90,
  /** Umbral de asistencia mínima aceptable (%). */
  UMBRAL_MINIMO: 70,
  /** Umbral por debajo del cual se considera riesgo alto (%). */
  UMBRAL_CRITICO: 60,
} as const;

export type RegistroAsistencia = {
  present: boolean;
  durationMinutes?: number | null;
  /**
   * Falta con excusa registrada (`Asistencia.excusa`). Una falta justificada
   * **no cuenta**: sale del numerador y del denominador, así que ni baja el
   * porcentaje ni suma al cupo de faltas. En un registro presente no significa
   * nada y se ignora.
   */
  justificada?: boolean;
};

export type ResumenAsistencia = {
  /** Clases que cuentan: las dictadas menos las faltas justificadas. */
  totalClases: number;
  clasesPresente: number;
  /** Faltas con excusa; no entran en ninguna otra cifra. */
  clasesJustificadas: number;
  clasesAusente: number;
  minutosTotales: number;
  minutosPresente: number;
  minutosAusente: number;
  /** Porcentaje ponderado por minutos (0–100). */
  porcentaje: number;
};

function duracion(registro: RegistroAsistencia): number {
  const minutos = Number(registro.durationMinutes ?? ASISTENCIA.DURACION_DEFECTO);
  return Number.isFinite(minutos) && minutos > 0 ? minutos : ASISTENCIA.DURACION_DEFECTO;
}

export function esFaltaJustificada(registro: RegistroAsistencia): boolean {
  return !registro.present && registro.justificada === true;
}

export function calcularAsistencia(entrada: RegistroAsistencia[]): ResumenAsistencia {
  const registros = entrada.filter(r => !esFaltaJustificada(r));
  let minutosTotales = 0;
  let minutosPresente = 0;
  let clasesPresente = 0;

  for (const registro of registros) {
    const min = duracion(registro);
    minutosTotales += min;
    if (registro.present) {
      minutosPresente += min;
      clasesPresente += 1;
    }
  }

  const porcentaje = minutosTotales
    ? Math.round((minutosPresente / minutosTotales) * 100 * 100) / 100
    : 100;

  return {
    totalClases: registros.length,
    clasesPresente,
    clasesJustificadas: entrada.length - registros.length,
    clasesAusente: registros.length - clasesPresente,
    minutosTotales,
    minutosPresente,
    minutosAusente: minutosTotales - minutosPresente,
    porcentaje,
  };
}
