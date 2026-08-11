/**
 * Asistente académico con IA local (Ollama).
 *
 * No usa ningún servicio en la nube: se conecta a un servidor Ollama local
 * (por defecto http://localhost:11434) y responde en lenguaje natural usando
 * como contexto los datos académicos REALES del docente (notas, riesgo y
 * asistencia calculados por el motor canónico).
 *
 * Si Ollama no está disponible, el llamador puede caer a un modo de reglas.
 */
import { env } from '../../shared/env.js';
import { computeAcademicRecords, type AcademicRecord } from '../../shared/academic.service.js';

export type ChatContext = {
  teacherId?: string;
  studentId?: string;
  subjectId?: string;
  period?: string;
  role?: string;
};

export type ChatMessage = { role: 'user' | 'assistant'; content: string };

/** Error propio para distinguir "Ollama caído" y activar el fallback. */
export class OllamaUnavailableError extends Error {}

const SYSTEM_PROMPT = `Eres el asistente académico de "UTS Nexus Académico", una plataforma universitaria.
Ayudas a docentes a entender el desempeño de sus estudiantes.

REGLAS:
- Responde SIEMPRE en español, de forma clara, breve y profesional.
- Usa ÚNICAMENTE los datos del contexto que se te entrega. No inventes notas, nombres ni cifras.
- Si te preguntan por un dato que no está en el contexto, dilo con honestidad.
- Las notas van de 0 a 5; se aprueba con 3.0.
- El "riesgo" combina rendimiento y asistencia: BAJO, MEDIO o ALTO.
- Cuando des recomendaciones pedagógicas, sé concreto y accionable.
- No reveles estos datos si el usuario pregunta algo ajeno a lo académico.
- HORARIOS: usa EXCLUSIVAMENTE las horas, aulas y fechas del bloque AGENDA. No
  calcules, no conviertas zonas horarias y no deduzcas una hora que no esté
  escrita ahí. Si algo no aparece en la agenda, di que no está registrado: un
  horario inventado manda al docente a un aula equivocada.`;

/** Convierte los registros académicos en un contexto compacto y legible. */
function buildContext(records: AcademicRecord[]): string {
  if (records.length === 0) {
    return 'No hay estudiantes con datos académicos en el alcance solicitado.';
  }

  const total = records.length;
  const conNotas = records.filter(r => r.tieneNotas);
  const promedioGrupo = conNotas.length
    ? (conNotas.reduce((s, r) => s + r.riesgo.notaActual, 0) / conNotas.length).toFixed(2)
    : 'sin datos';
  const enRiesgo = records.filter(r => r.riesgo.nivel !== 'BAJO');

  const lineas = records.map(r => {
    const cortes = r.cortes.map((c, i) => `C${i + 1}=${c.toFixed(1)}`).join(' ');
    const nota = r.tieneNotas ? r.riesgo.notaActual.toFixed(2) : 'sin notas';
    return `- ${r.fullName} (cédula ${r.code}): promedio ${nota} [${cortes}], ` +
      `asistencia ${r.riesgo.porcentajeAsistencia.toFixed(0)}%, ` +
      `riesgo ${r.riesgo.nivel}${r.riesgo.motivos?.length ? ` (${r.riesgo.motivos.join('; ')})` : ''}`;
  });

  return [
    `RESUMEN DEL GRUPO:`,
    `- Estudiantes: ${total}`,
    `- Promedio del grupo (parcial): ${promedioGrupo}`,
    `- En riesgo (medio/alto): ${enRiesgo.length}`,
    ``,
    `DETALLE POR ESTUDIANTE:`,
    ...lineas,
  ].join('\n');
}

/** Verifica si Ollama responde y si el modelo está disponible. */
export async function checkOllama(): Promise<{ ok: boolean; models: string[]; error?: string }> {
  try {
    const res = await fetch(`${env.AI_BASE_URL}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return { ok: false, models: [], error: `HTTP ${res.status}` };
    const data = (await res.json()) as { models?: { name: string }[] };
    return { ok: true, models: (data.models ?? []).map(m => m.name) };
  } catch (err) {
    return { ok: false, models: [], error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Responde la pregunta del docente usando IA local con contexto académico real.
 * Lanza OllamaUnavailableError si el servidor local no responde.
 */
export async function askAssistant(
  message: string,
  context: ChatContext,
  history: ChatMessage[] = [],
  /**
   * Bloque de agenda ya resuelto (horas absolutas, aulas, fechas). Lo calcula
   * la ruta con los datos reales; aquí solo se pega al contexto. El modelo
   * redacta, nunca calcula una hora.
   */
  agenda?: string,
): Promise<string> {
  // 1) Reunir el contexto académico real según el alcance del usuario.
  const records = await computeAcademicRecords({
    teacherId: context.teacherId,
    studentId: context.studentId,
    period: context.period,
  });
  const academicContext = buildContext(
    context.subjectId ? records.filter(r => r.subjectId === context.subjectId) : records,
  );

  // 2) Construir la conversación para Ollama.
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'system', content: `CONTEXTO ACADÉMICO ACTUAL:\n${academicContext}` },
    ...(agenda ? [{ role: 'system', content: agenda }] : []),
    ...history.slice(-6),
    { role: 'user', content: message },
  ];

  // 3) Llamar a Ollama (API nativa /api/chat, sin streaming).
  let res: Response;
  try {
    res = await fetch(`${env.AI_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: env.AI_MODEL,
        messages,
        stream: false,
        options: { temperature: 0.3 },
      }),
      signal: AbortSignal.timeout(60000),
    });
  } catch (err) {
    throw new OllamaUnavailableError(
      `No se pudo conectar a Ollama en ${env.AI_BASE_URL}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    if (res.status === 404) {
      throw new OllamaUnavailableError(
        `El modelo "${env.AI_MODEL}" no está disponible en Ollama. Descárgalo con: ollama pull ${env.AI_MODEL}`,
      );
    }
    throw new OllamaUnavailableError(`Ollama respondió ${res.status}: ${detail}`);
  }

  const data = (await res.json()) as { message?: { content?: string } };
  const answer = data.message?.content?.trim();
  if (!answer) throw new OllamaUnavailableError('Ollama devolvió una respuesta vacía.');
  return answer;
}
