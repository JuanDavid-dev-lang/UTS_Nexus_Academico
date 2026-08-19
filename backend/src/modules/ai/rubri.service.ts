import { env } from '../../shared/env.js';

export const RUBRI_INTENTS = [
  'CREATE_COURSE', 'GET_COURSES', 'GET_STUDENTS', 'IMPORT_STUDENTS',
  'GET_SCHEDULE', 'UPDATE_SCHEDULE', 'GET_CLASSROOM', 'HELP', 'NAVIGATE',
  'SEARCH_STUDENT', 'COURSE_INFORMATION',
] as const;

export type RubriIntent = (typeof RUBRI_INTENTS)[number];
export type RubriEmotion = 'neutral' | 'happy' | 'sad' | 'offline';
export type RubriAction = { type: 'NAVIGATE'; route: string; label: string };
export type RubriInterpretation = {
  intent: RubriIntent;
  confidence: number;
  modelVersion: string;
  latencyMs: number;
};

const ACTIONS: Partial<Record<RubriIntent, RubriAction>> = {
  CREATE_COURSE: { type: 'NAVIGATE', route: '/materias', label: 'Abrir asignaturas' },
  GET_COURSES: { type: 'NAVIGATE', route: '/materias', label: 'Ver mis asignaturas' },
  GET_STUDENTS: { type: 'NAVIGATE', route: '/estudiantes', label: 'Ver estudiantes' },
  IMPORT_STUDENTS: { type: 'NAVIGATE', route: '/estudiantes', label: 'Importar estudiantes' },
  GET_SCHEDULE: { type: 'NAVIGATE', route: '/agenda', label: 'Abrir agenda' },
  UPDATE_SCHEDULE: { type: 'NAVIGATE', route: '/agenda', label: 'Editar horario' },
  GET_CLASSROOM: { type: 'NAVIGATE', route: '/agenda', label: 'Consultar agenda' },
  SEARCH_STUDENT: { type: 'NAVIGATE', route: '/estudiantes', label: 'Buscar estudiante' },
  COURSE_INFORMATION: { type: 'NAVIGATE', route: '/materias', label: 'Abrir asignaturas' },
};

/** Solo rutas internas conocidas. El modelo nunca produce URLs ejecutables. */
export function accionSegura(intent: RubriIntent, confidence: number): RubriAction | null {
  if (confidence < 0.42) return null;
  return ACTIONS[intent] ?? null;
}

export async function interpretarConRubri(message: string): Promise<RubriInterpretation | null> {
  if (!env.ML_ENABLED) return null;
  try {
    const response = await fetch(`${env.ML_BASE_URL}/rubri/intent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as Record<string, unknown>;
    if (!RUBRI_INTENTS.includes(data.intent as RubriIntent)) return null;
    return {
      intent: data.intent as RubriIntent,
      confidence: Number(data.confidence ?? 0),
      modelVersion: String(data.model_version ?? 'rubri-intents'),
      latencyMs: Number(data.latency_ms ?? 0),
    };
  } catch {
    return null;
  }
}

export async function estadoRubri(): Promise<{ available: boolean; model?: string; metrics?: unknown }> {
  if (!env.ML_ENABLED) return { available: false };
  try {
    const response = await fetch(`${env.ML_BASE_URL}/rubri/metrics`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return { available: false };
    const data = (await response.json()) as Record<string, unknown>;
    return { available: data.ok === true, model: String(data.version ?? ''), metrics: data };
  } catch {
    return { available: false };
  }
}

