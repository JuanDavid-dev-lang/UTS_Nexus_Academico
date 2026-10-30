/**
 * Planilla de calificaciones: la forma, no la aritmética.
 *
 * Todo número que sale de aquí ya venía calculado en el consolidado del
 * servidor (promedio de cada componente, nota del corte, definitiva). Esto
 * solo decide qué fila lleva cada estudiante y en qué casilla cae cada cifra.
 */
import type { ComponentType, ConsolidatedRow, CutNumber } from '@/domain/schemas/grades';

export const CORTES: CutNumber[] = [1, 2, 3];
export const COMPONENTES: ComponentType[] = ['TRABAJOS', 'PARCIALES', 'AUTOEVALUACION'];

export type FilaPlanilla = {
  studentId: string;
  code: string;
  fullName: string;
  /** null cuando el estudiante está matriculado y aún no tiene ninguna nota. */
  row: ConsolidatedRow | null;
};

type Matriculado = { _id: string; code: string; fullName: string };

/**
 * Una fila por estudiante, en orden de lista.
 *
 * El consolidado solo trae a quien ya tiene notas; una planilla de clase lleva
 * a todo el grupo, y un estudiante sin calificar es justo el que hay que ver.
 */
export function filasDePlanilla(
  consolidado: readonly ConsolidatedRow[],
  matriculados: readonly Matriculado[],
): FilaPlanilla[] {
  const filas = new Map<string, FilaPlanilla>();
  for (const row of consolidado) {
    filas.set(row.studentId, { studentId: row.studentId, code: row.code, fullName: row.fullName, row });
  }
  for (const estudiante of matriculados) {
    if (filas.has(estudiante._id)) continue;
    filas.set(estudiante._id, {
      studentId: estudiante._id,
      code: estudiante.code,
      fullName: estudiante.fullName,
      row: null,
    });
  }
  return [...filas.values()].sort((a, b) => a.fullName.localeCompare(b.fullName, 'es'));
}

export type CeldaCorte = { nota: number; completo: boolean };
export type CeldaComponente = { promedio: number; registros: number };

export function celdaCorte(row: ConsolidatedRow | null, corte: CutNumber): CeldaCorte | null {
  const resumen = row?.cortes.find((item) => item.corte === corte);
  return resumen ? { nota: resumen.nota, completo: resumen.completo } : null;
}

/** null si el componente no tiene ninguna nota: «sin calificar» no es un 0. */
export function celdaComponente(
  row: ConsolidatedRow | null,
  corte: CutNumber,
  tipo: ComponentType,
): CeldaComponente | null {
  const componente = row?.cortes
    .find((item) => item.corte === corte)
    ?.componentes.find((item) => item.tipo === tipo);
  if (!componente || componente.registros <= 0) return null;
  return { promedio: componente.promedio, registros: componente.registros };
}

/**
 * El peso de cada componente tal como lo informa el servidor, para rotular las
 * columnas. No se escribe 30/60/10 aquí: si la rúbrica cambia en el backend, el
 * encabezado cambia con ella. Sin datos, el componente va sin porcentaje.
 */
export function pesosDeComponentes(consolidado: readonly ConsolidatedRow[]): Partial<Record<ComponentType, number>> {
  const pesos: Partial<Record<ComponentType, number>> = {};
  for (const row of consolidado) {
    for (const corte of row.cortes) {
      for (const componente of corte.componentes) {
        if (pesos[componente.tipo] === undefined) pesos[componente.tipo] = componente.peso;
      }
    }
    if (COMPONENTES.every((tipo) => pesos[tipo] !== undefined)) break;
  }
  return pesos;
}
