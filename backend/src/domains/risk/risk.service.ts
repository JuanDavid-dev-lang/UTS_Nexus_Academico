/**
 * Dominio de riesgo académico. Combina rendimiento (nota) y asistencia
 * ponderada para clasificar a un estudiante en un nivel de riesgo y generar
 * el texto de la alerta. Fuente única para dashboard, notificaciones y móvil.
 */

import { RUBRICA, type NotaComponente, calcularPromedioParcial } from '../grading/grading.service.js';
import { ASISTENCIA, type RegistroAsistencia, calcularAsistencia } from '../attendance/attendance.service.js';

export type NivelRiesgo = 'BAJO' | 'MEDIO' | 'ALTO';

export type EntradaRiesgo = {
  notas: NotaComponente[];
  asistencia: RegistroAsistencia[];
};

export type ResultadoRiesgo = {
  nivel: NivelRiesgo;
  /** Puntaje 0–100 (mayor = más riesgo). */
  puntaje: number;
  /** Promedio actual (parcial) sobre los cortes ya calificados. */
  notaActual: number;
  /** true si el estudiante aún no tiene ninguna nota. */
  sinNotas: boolean;
  porcentajeAsistencia: number;
  clasesAusente: number;
  motivos: string[];
};

/**
 * Reglas (basadas en el desempeño ACTUAL, no en la final con ceros):
 *  - Bajo rendimiento: promedio parcial < 3.0 (solo si ya hay notas).
 *  - Faltas acumuladas: asistencia ponderada < 70% (crítico < 60%).
 *  - El puntaje mezcla el déficit de nota y el déficit de asistencia.
 */
export function evaluarRiesgo(entrada: EntradaRiesgo): ResultadoRiesgo {
  const parcial = calcularPromedioParcial(entrada.notas);
  const asistencia = calcularAsistencia(entrada.asistencia);
  const motivos: string[] = [];
  const sinNotas = parcial.cortesConNota === 0;

  // Sin notas todavía: el riesgo depende solo de la asistencia.
  const deficitNota = sinNotas ? 0 : Math.max(0, RUBRICA.NOTA_APROBACION - parcial.promedio);
  const deficitAsistencia = Math.max(0, ASISTENCIA.UMBRAL_MINIMO - asistencia.porcentaje);

  if (!sinNotas && parcial.promedio < RUBRICA.NOTA_APROBACION) {
    motivos.push(
      `Bajo rendimiento: promedio ${parcial.promedio.toFixed(2)} (mínimo ${RUBRICA.NOTA_APROBACION.toFixed(1)}).`
    );
  }
  if (asistencia.porcentaje < ASISTENCIA.UMBRAL_MINIMO) {
    motivos.push(
      `Faltas acumuladas: asistencia ${asistencia.porcentaje.toFixed(1)}% (mínimo ${ASISTENCIA.UMBRAL_MINIMO}%).`
    );
  }
  if (asistencia.clasesAusente >= 3) {
    motivos.push(`${asistencia.clasesAusente} clases perdidas.`);
  }

  // Déficit de nota aporta hasta 60 pts (5.0 de rango -> factor 12).
  // Déficit de asistencia aporta hasta 40 pts.
  const puntaje = Math.min(
    100,
    Math.round(deficitNota * 12 + deficitAsistencia * 0.5 + asistencia.clasesAusente * 2)
  );

  let nivel: NivelRiesgo = 'BAJO';
  if (
    puntaje >= 60 ||
    asistencia.porcentaje < ASISTENCIA.UMBRAL_CRITICO ||
    (!sinNotas && parcial.promedio < RUBRICA.NOTA_APROBACION - 1)
  ) {
    nivel = 'ALTO';
  } else if (
    puntaje >= 30 ||
    asistencia.porcentaje < ASISTENCIA.UMBRAL_MINIMO ||
    (!sinNotas && parcial.promedio < RUBRICA.NOTA_APROBACION)
  ) {
    nivel = 'MEDIO';
  }

  return {
    nivel,
    puntaje,
    notaActual: parcial.promedio,
    sinNotas,
    porcentajeAsistencia: asistencia.porcentaje,
    clasesAusente: asistencia.clasesAusente,
    motivos,
  };
}
