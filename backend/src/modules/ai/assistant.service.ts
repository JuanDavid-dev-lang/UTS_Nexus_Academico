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

/**
 * Cuántos estudiantes se detallan como máximo en el contexto.
 *
 * El resumen agregado va siempre; lo que se recorta es el detalle línea a
 * línea, y se recorta por prioridad, no por orden alfabético.
 */
const TOPE_DETALLE = 40;

/** Orden de atención: primero lo que el docente necesita mirar. */
const PESO_RIESGO: Record<string, number> = { ALTO: 0, MEDIO: 1, BAJO: 2 };

/** Una línea de detalle por estudiante. */
function lineaEstudiante(r: AcademicRecord): string {
  const cortes = r.cortes.map((c, i) => `C${i + 1}=${c.toFixed(1)}`).join(' ');
  const nota = r.tieneNotas ? r.riesgo.notaActual.toFixed(2) : 'sin notas';
  return `- ${r.fullName} (cédula ${r.code}): promedio ${nota} [${cortes}], ` +
    `asistencia ${r.riesgo.porcentajeAsistencia.toFixed(0)}%, ` +
    `riesgo ${r.riesgo.nivel}${r.riesgo.motivos?.length ? ` (${r.riesgo.motivos.join('; ')})` : ''}`;
}

/**
 * Convierte los registros académicos en un contexto compacto y legible.
 *
 * El detalle está **acotado y priorizado**, y las dos cosas por el mismo
 * motivo. Antes se emitía una línea por estudiante sin techo: un ADMIN no
 * lleva `teacherId`, así que su contexto era la institución entera. Ollama no
 * protesta ante un prompt que no le cabe —lo recorta por `num_ctx` en
 * silencio—, y lo que se cae del recorte es el final, es decir, **la pregunta
 * del docente**. El modelo respondía entonces a un listado sin pregunta, que
 * es la forma más discreta que tiene una respuesta de estar inventada.
 *
 * Cuando hay más estudiantes de los que caben se detallan los de riesgo alto
 * primero y se dice cuántos quedaron fuera, para que el modelo pueda admitir
 * que no los tiene en vez de dar por hecho que la lista está completa.
 */
export function buildContext(records: AcademicRecord[]): string {
  if (records.length === 0) {
    return 'No hay estudiantes con datos académicos en el alcance solicitado.';
  }

  const total = records.length;
  const conNotas = records.filter(r => r.tieneNotas);
  const promedioGrupo = conNotas.length
    ? (conNotas.reduce((s, r) => s + r.riesgo.notaActual, 0) / conNotas.length).toFixed(2)
    : 'sin datos';
  const enRiesgo = records.filter(r => r.riesgo.nivel !== 'BAJO');
  const reprobando = conNotas.filter(r => r.riesgo.notaActual < 3).length;
  const asistenciaBaja = records.filter(r => r.riesgo.porcentajeAsistencia < 80).length;

  // Riesgo alto primero, y a igual riesgo el de peor nota: si hay que cortar,
  // que lo que sobreviva sea aquello sobre lo que se pregunta.
  const priorizados = [...records].sort((a, b) => {
    const porRiesgo = (PESO_RIESGO[a.riesgo.nivel] ?? 3) - (PESO_RIESGO[b.riesgo.nivel] ?? 3);
    return porRiesgo !== 0 ? porRiesgo : a.riesgo.notaActual - b.riesgo.notaActual;
  });

  const detallados = priorizados.slice(0, TOPE_DETALLE);
  const omitidos = total - detallados.length;

  return [
    `RESUMEN DEL GRUPO:`,
    `- Estudiantes: ${total}`,
    `- Promedio del grupo (parcial): ${promedioGrupo}`,
    `- En riesgo (medio/alto): ${enRiesgo.length}`,
    `- Por debajo de 3.0: ${reprobando}`,
    `- Con asistencia bajo el 80%: ${asistenciaBaja}`,
    ``,
    omitidos > 0
      ? `DETALLE (${detallados.length} de ${total}, los de mayor riesgo primero):`
      : `DETALLE POR ESTUDIANTE:`,
    ...detallados.map(lineaEstudiante),
    ...(omitidos > 0
      ? [
          ``,
          `Hay ${omitidos} estudiante(s) más que no caben en este contexto. Si te ` +
            `preguntan por alguien que no aparece arriba, di que no lo tienes a la ` +
            `vista y pide que acoten por materia o por estudiante. NO lo des por ` +
            `ausente ni supongas sus datos.`,
        ]
      : []),
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
