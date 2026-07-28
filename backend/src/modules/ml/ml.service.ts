/**
 * Puente con el servicio de predicción de riesgo.
 *
 * El backend sigue siendo la fuente de verdad de las notas; lo que delega es la
 * *estimación* del riesgo. Si el servicio no responde, se cae al motor de reglas
 * de `domains/risk` y se declara en `source`, para que la interfaz pueda decirle
 * al docente de dónde salió cada alerta.
 */
import { env } from '../../shared/env.js';
import { evaluarRiesgo } from '../../domains/risk/risk.service.js';
import type { AcademicRecord } from '../../shared/academic.service.js';

export type MlFeatures = {
  student_id: string;
  subject_id: string;
  cut1: number;
  cut2: number;
  cut3: number;
  cuts_graded: number;
  partial_average: number;
  attendance_rate: number;
  missed_classes: number;
  total_classes: number;
  group_average: number;
};

export type MlPrediction = {
  student_id: string;
  subject_id: string;
  probability: number;
  level: 'LOW' | 'MEDIUM' | 'HIGH';
  source: 'model' | 'rules';
  reasons: string[];
  contributions?: { feature: string; label: string; value: number; contribution: number }[];
};

/** Traduce un registro académico a las señales que consume el modelo. */
export function toFeatures(record: AcademicRecord, groupAverage: number): MlFeatures {
  const cuts = record.cortes ?? [];
  const graded = cuts.filter(nota => nota > 0);

  return {
    student_id: String(record.studentId),
    subject_id: String(record.subjectId),
    cut1: Number(cuts[0] ?? 0),
    cut2: Number(cuts[1] ?? 0),
    cut3: Number(cuts[2] ?? 0),
    cuts_graded: graded.length,
    partial_average: Number(record.riesgo.notaActual ?? 0),
    attendance_rate: Number(record.riesgo.porcentajeAsistencia ?? 0),
    missed_classes: Number(record.riesgo.clasesAusente ?? 0),
    // El motor de asistencia no expone el total de clases; se reconstruye desde
    // las faltas y el porcentaje, que es lo que sí devuelve.
    total_classes: estimateTotalClasses(
      Number(record.riesgo.clasesAusente ?? 0),
      Number(record.riesgo.porcentajeAsistencia ?? 100)
    ),
    group_average: groupAverage,
  };
}

function estimateTotalClasses(missed: number, attendanceRate: number): number {
  if (missed <= 0) return 0;
  const absenceRatio = (100 - attendanceRate) / 100;
  if (absenceRatio <= 0) return missed;
  return Math.max(missed, Math.round(missed / absenceRatio));
}

/** Respuesta de reglas, con la misma forma que la del modelo. */
function rulesPrediction(record: AcademicRecord): MlPrediction {
  const riesgo = record.riesgo;
  const level = riesgo.nivel === 'ALTO' ? 'HIGH' : riesgo.nivel === 'MEDIO' ? 'MEDIUM' : 'LOW';

  return {
    student_id: String(record.studentId),
    subject_id: String(record.subjectId),
    probability: Math.min(1, riesgo.puntaje / 100),
    level,
    source: 'rules',
    reasons: riesgo.motivos?.length
      ? riesgo.motivos
      : ['El desempeño está dentro de lo esperado.'],
  };
}

export async function mlStatus(): Promise<{
  enabled: boolean;
  available: boolean;
  version?: string;
  origin?: string;
  metrics?: unknown;
  message?: string;
}> {
  if (!env.ML_ENABLED) {
    return { enabled: false, available: false, message: 'ML desactivado (ML_ENABLED=0).' };
  }

  try {
    const response = await fetch(`${env.ML_BASE_URL}/metrics`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return { enabled: true, available: false, message: `HTTP ${response.status}` };

    const data = (await response.json()) as Record<string, unknown>;
    return {
      enabled: true,
      available: data.ok === true,
      version: data.version as string | undefined,
      origin: data.origin as string | undefined,
      metrics: data,
    };
  } catch (err) {
    return {
      enabled: true,
      available: false,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Predice el riesgo de un conjunto de registros.
 *
 * Nunca lanza: ante cualquier fallo devuelve las predicciones de reglas. Dejar
 * al docente sin información porque un servicio auxiliar se cayó sería peor que
 * darle una estimación más simple.
 */
export async function predictRisk(records: AcademicRecord[]): Promise<MlPrediction[]> {
  if (records.length === 0) return [];
  if (!env.ML_ENABLED) return records.map(rulesPrediction);

  // Promedio por materia: contextualiza la nota de cada estudiante.
  const bySubject = new Map<string, number[]>();
  for (const record of records) {
    const key = String(record.subjectId);
    if (!bySubject.has(key)) bySubject.set(key, []);
    if (record.tieneNotas) bySubject.get(key)!.push(record.riesgo.notaActual);
  }
  const averages = new Map(
    [...bySubject.entries()].map(([key, notas]) => [
      key,
      notas.length ? notas.reduce((sum, nota) => sum + nota, 0) / notas.length : 0,
    ])
  );

  const students = records.map(record =>
    toFeatures(record, averages.get(String(record.subjectId)) ?? 0)
  );

  try {
    const response = await fetch(`${env.ML_BASE_URL}/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ students }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = (await response.json()) as { predictions?: MlPrediction[] };
    if (!data.predictions?.length) throw new Error('Respuesta sin predicciones');
    return data.predictions;
  } catch (err) {
    console.warn(
      `[ml] Servicio no disponible (${err instanceof Error ? err.message : err}); usando reglas.`
    );
    return records.map(rulesPrediction);
  }
}

/** Envía casos cerrados al servicio para reentrenar. */
export async function trainModel(
  examples: { features: MlFeatures; failed: boolean }[],
  force = false
): Promise<{ ok: boolean; promoted?: boolean; reason?: string; detail?: string }> {
  if (!env.ML_ENABLED) return { ok: false, detail: 'ML desactivado.' };

  try {
    const response = await fetch(`${env.ML_BASE_URL}/train`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ examples, force }),
      // Entrenar tarda; el presupuesto es amplio a propósito.
      signal: AbortSignal.timeout(180000),
    });

    const data = (await response.json()) as Record<string, unknown>;
    if (!response.ok) {
      return { ok: false, detail: String(data.detail ?? `HTTP ${response.status}`) };
    }
    return {
      ok: true,
      promoted: data.promoted as boolean,
      reason: data.reason as string,
    };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

export { evaluarRiesgo };
