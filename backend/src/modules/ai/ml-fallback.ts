/**
 * Respaldo del asistente con el modelo interno de ML.
 *
 * Cuando Ollama no está disponible, el asistente no se queda en frases
 * genéricas: las preguntas académicas se responden con las predicciones del
 * servicio de ML (scikit-learn, en Python), que es el mismo modelo que alimenta
 * la pantalla de riesgo. No redacta libre —eso es lo que hacía Ollama—, pero
 * los números y los motivos son los del modelo, no una plantilla.
 *
 * Si el servicio de ML tampoco responde, `predictRisk()` ya degrada solo al
 * motor de reglas y lo declara en `source`: aquí solo se traduce eso al texto.
 */
import { computeAcademicRecords, type AcademicRecord } from '../../shared/academic.service.js';
import { predictRisk, type MlPrediction } from '../ml/ml.service.js';

export type MlAnswer = { answer: string; source: 'ml' | 'rules' };

/**
 * ¿La pregunta es sobre lo académico?
 *
 * El respaldo solo aplica a lo que el modelo sabe contestar: riesgo, notas y
 * asistencia. Responder «¿cómo cambio mi contraseña?» con una tabla de riesgo
 * sería peor que admitir que no hay modelo conversacional.
 */
export function pareceAcademica(mensaje: string): boolean {
  return /riesgo|peligro|promedio|nota|calificaci|asistencia|rendimiento|desempe|reprob|aprob|estudiante|alumno|grupo|curso|c[oó]mo va|qui[eé]n/i.test(
    mensaje,
  );
}

export const NIVEL: Record<MlPrediction['level'], string> = {
  HIGH: 'ALTO',
  MEDIUM: 'MEDIO',
  LOW: 'BAJO',
};

/** Una línea por estudiante con la predicción del modelo. La comparten el
 * respaldo del chat y las consultas rápidas para que el mismo estudiante no se
 * describa de dos formas según el botón que se tocó. */
export function lineaPrediccion(record: AcademicRecord, prediccion: MlPrediction): string {
  const nota = record.tieneNotas ? record.riesgo.notaActual.toFixed(2) : 'sin notas';
  const motivos = prediccion.reasons.length ? ` — ${prediccion.reasons.join('; ')}` : '';
  return (
    `• ${record.fullName} (cédula ${record.code}): riesgo ${NIVEL[prediccion.level]} ` +
    `(${Math.round(prediccion.probability * 100)}%), promedio ${nota}, ` +
    `asistencia ${record.riesgo.porcentajeAsistencia.toFixed(0)}%${motivos}`
  );
}

/**
 * Responde una pregunta académica con las predicciones del modelo.
 *
 * Devuelve null si no hay datos en el alcance: en ese caso el llamador cae al
 * mensaje genérico, que es la respuesta honesta.
 */
export async function responderConModelo(contexto: {
  teacherId?: string;
  studentId?: string;
  subjectId?: string;
}): Promise<MlAnswer | null> {
  const records = await computeAcademicRecords({
    teacherId: contexto.teacherId,
    studentId: contexto.studentId,
  });
  const alcance = contexto.subjectId
    ? records.filter(r => String(r.subjectId) === contexto.subjectId)
    : records;
  if (alcance.length === 0) return null;

  const predicciones = await predictRisk(alcance);
  const porClave = new Map(predicciones.map(p => [`${p.student_id}:${p.subject_id}`, p]));
  const emparejados = alcance
    .map(r => ({ record: r, prediccion: porClave.get(`${r.studentId}:${r.subjectId}`) }))
    .filter((par): par is { record: AcademicRecord; prediccion: MlPrediction } => !!par.prediccion);
  if (emparejados.length === 0) return null;

  const usoModelo = emparejados.some(par => par.prediccion.source === 'model');
  const peso: Record<MlPrediction['level'], number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  const ordenados = [...emparejados].sort(
    (a, b) =>
      peso[a.prediccion.level] - peso[b.prediccion.level] ||
      b.prediccion.probability - a.prediccion.probability,
  );

  // Detalle de un estudiante concreto: todas sus materias en alcance.
  if (contexto.studentId) {
    const lineas = ordenados.map(par => lineaPrediccion(par.record, par.prediccion));
    return {
      answer: [`Análisis del estudiante según el modelo de predicción:`, ...lineas].join('\n'),
      source: usoModelo ? 'ml' : 'rules',
    };
  }

  const conNotas = emparejados.filter(par => par.record.tieneNotas);
  const promedio = conNotas.length
    ? (
        conNotas.reduce((s, par) => s + par.record.riesgo.notaActual, 0) / conNotas.length
      ).toFixed(2)
    : 'sin datos';
  const enRiesgo = ordenados.filter(par => par.prediccion.level !== 'LOW');
  const detalle = enRiesgo.slice(0, 8);

  const lineas = [
    `Estado del grupo según el modelo de predicción:`,
    `• Estudiantes analizados: ${emparejados.length}`,
    `• Promedio del grupo (parcial): ${promedio}`,
    `• En riesgo (medio/alto): ${enRiesgo.length}`,
  ];
  if (detalle.length > 0) {
    lineas.push('', 'Quienes necesitan atención primero:');
    lineas.push(...detalle.map(par => lineaPrediccion(par.record, par.prediccion)));
    if (enRiesgo.length > detalle.length) {
      lineas.push(`…y ${enRiesgo.length - detalle.length} más en la pantalla de Riesgo.`);
    }
  } else {
    lineas.push('', 'Ningún estudiante en riesgo: todos dentro de lo esperado.');
  }

  return { answer: lineas.join('\n'), source: usoModelo ? 'ml' : 'rules' };
}
