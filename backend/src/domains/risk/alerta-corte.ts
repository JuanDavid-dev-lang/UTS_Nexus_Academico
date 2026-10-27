/**
 * Alerta temprana por corte. **Lógica pura, sin base de datos.**
 *
 * El riesgo mira el promedio parcial, y un primer corte en 2.6 seguido de un
 * segundo en 4.5 deja el promedio en verde: el estudiante ya no sale en la
 * lista, pero el 2.6 fue el momento de ofrecerle tutoría. Esta alerta se
 * dispara al cerrarse cada corte por debajo de la aprobación, una vez por
 * corte, y lleva al seguimiento del caso.
 *
 * Un corte solo cuenta **completo** (sus tres componentes con nota): con solo
 * los trabajos calificados, la nota del corte lleva ceros en parciales y
 * autoevaluación y avisaría de un 0.9 que no existe.
 */
import { RUBRICA } from '../grading/grading.service.js';

export type CorteEnAlerta = { corte: 1 | 2 | 3; nota: number };

export function cortesEnAlerta(cortes: number[], completos: boolean[]): CorteEnAlerta[] {
  const alertas: CorteEnAlerta[] = [];
  cortes.slice(0, 3).forEach((nota, i) => {
    if (!completos[i] || !Number.isFinite(nota)) return;
    if (nota < RUBRICA.NOTA_APROBACION) alertas.push({ corte: (i + 1) as 1 | 2 | 3, nota });
  });
  return alertas;
}

/** Identidad del hecho: un aviso por estudiante, materia, periodo y corte. */
export function claveAlertaCorte(
  studentId: string,
  subjectId: string,
  period: string,
  corte: number,
): string {
  return `corte-bajo:${studentId}:${subjectId}:${period}:${corte}`;
}

export function mensajeAlertaCorte(nombre: string, materia: string, alerta: CorteEnAlerta): string {
  return (
    `${nombre} sacó ${alerta.nota.toFixed(1)} en el corte ${alerta.corte} de ${materia}. ` +
    'Ábrele un seguimiento: una tutoría ahora pesa más que al final del semestre.'
  );
}
