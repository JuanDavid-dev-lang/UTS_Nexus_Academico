/**
 * Consultas rápidas del asistente: botones, no chat.
 *
 * Las preguntas que un docente hace todos los días —cómo va el grupo, quién
 * está en riesgo, cuánto necesitan para aprobar— no deberían exigir redactar
 * un mensaje. Cada tipo de consulta se responde **de forma determinista** con
 * los datos del motor canónico y, donde hay estimación, con el modelo de ML:
 * aquí no interviene el modelo conversacional, así que la respuesta es la
 * misma con y sin Ollama, y ningún número puede salir inventado.
 */
import { computeAcademicRecords, type AcademicRecord } from '../../shared/academic.service.js';
import { predictRisk, type MlPrediction } from '../ml/ml.service.js';
import { notaNecesariaEnRestantes } from '../../domains/grading/grading.service.js';
import { lineaPrediccion } from './ml-fallback.js';

export const TIPOS_CONSULTA = [
  'estado',
  'riesgo',
  'asistencia',
  'aprobacion',
  'necesita',
] as const;
export type TipoConsulta = (typeof TIPOS_CONSULTA)[number];

/** El texto que el cliente pinta como burbuja del usuario. */
export const PREGUNTA: Record<TipoConsulta, string> = {
  estado: '¿Cómo va el grupo?',
  riesgo: '¿Quiénes están en riesgo?',
  asistencia: '¿Cómo está la asistencia?',
  aprobacion: '¿Cuántos van aprobando?',
  necesita: '¿Cuánto necesitan para aprobar?',
};

export type RespuestaRapida = {
  pregunta: string;
  answer: string;
  /** 'ml' si intervino el modelo entrenado; 'datos' si es aritmética directa. */
  source: 'ml' | 'datos';
};

const pct = (parte: number, total: number): string =>
  total > 0 ? `${Math.round((parte / total) * 100)}%` : '0%';

function promedioParcial(records: AcademicRecord[]): string {
  const conNotas = records.filter(r => r.tieneNotas);
  if (conNotas.length === 0) return 'sin notas todavía';
  return (
    conNotas.reduce((s, r) => s + r.riesgo.notaActual, 0) / conNotas.length
  ).toFixed(2);
}

async function conRiesgo(
  records: AcademicRecord[],
): Promise<{ pares: { record: AcademicRecord; prediccion: MlPrediction }[]; usoModelo: boolean }> {
  const predicciones = await predictRisk(records);
  const porClave = new Map(predicciones.map(p => [`${p.student_id}:${p.subject_id}`, p]));
  const pares = records
    .map(r => ({ record: r, prediccion: porClave.get(`${r.studentId}:${r.subjectId}`) }))
    .filter((par): par is { record: AcademicRecord; prediccion: MlPrediction } => !!par.prediccion);
  const peso: Record<MlPrediction['level'], number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  pares.sort(
    (a, b) =>
      peso[a.prediccion.level] - peso[b.prediccion.level] ||
      b.prediccion.probability - a.prediccion.probability,
  );
  return { pares, usoModelo: pares.some(par => par.prediccion.source === 'model') };
}

export async function consultaRapida(
  tipo: TipoConsulta,
  contexto: { teacherId?: string; subjectId?: string; groupId?: string },
): Promise<RespuestaRapida> {
  const pregunta = PREGUNTA[tipo];
  const todos = await computeAcademicRecords({ teacherId: contexto.teacherId });
  let records = contexto.subjectId
    ? todos.filter(r => String(r.subjectId) === contexto.subjectId)
    : todos;
  if (contexto.groupId) {
    records = records.filter(r => String(r.groupId ?? '') === contexto.groupId);
  }

  if (records.length === 0) {
    return {
      pregunta,
      answer: 'No hay estudiantes con datos académicos en ese alcance.',
      source: 'datos',
    };
  }

  const total = records.length;

  switch (tipo) {
    case 'estado': {
      const { pares, usoModelo } = await conRiesgo(records);
      const enRiesgo = pares.filter(par => par.prediccion.level !== 'LOW');
      const conNotas = records.filter(r => r.tieneNotas);
      const aprobando = conNotas.filter(r => r.riesgo.notaActual >= 3).length;
      const asistencia =
        records.reduce((s, r) => s + r.riesgo.porcentajeAsistencia, 0) / total;
      return {
        pregunta,
        answer: [
          `Estado general (${total} estudiante${total === 1 ? '' : 's'}):`,
          `• Promedio parcial del grupo: ${promedioParcial(records)}`,
          `• Aprobando hoy: ${aprobando} de ${conNotas.length} con notas (${pct(aprobando, conNotas.length)})`,
          `• En riesgo (medio/alto): ${enRiesgo.length} (${pct(enRiesgo.length, total)})`,
          `• Asistencia media: ${asistencia.toFixed(0)}%`,
        ].join('\n'),
        source: usoModelo ? 'ml' : 'datos',
      };
    }

    case 'riesgo': {
      const { pares, usoModelo } = await conRiesgo(records);
      const enRiesgo = pares.filter(par => par.prediccion.level !== 'LOW');
      if (enRiesgo.length === 0) {
        return {
          pregunta,
          answer: `Ninguno de los ${total} estudiantes está en riesgo: todos dentro de lo esperado.`,
          source: usoModelo ? 'ml' : 'datos',
        };
      }
      const detalle = enRiesgo.slice(0, 10);
      const lineas = [
        `En riesgo: ${enRiesgo.length} de ${total} (${pct(enRiesgo.length, total)}).`,
        ...detalle.map(par => lineaPrediccion(par.record, par.prediccion)),
      ];
      if (enRiesgo.length > detalle.length) {
        lineas.push(`…y ${enRiesgo.length - detalle.length} más en la pantalla de Riesgo.`);
      }
      return { pregunta, answer: lineas.join('\n'), source: usoModelo ? 'ml' : 'datos' };
    }

    case 'asistencia': {
      const media = records.reduce((s, r) => s + r.riesgo.porcentajeAsistencia, 0) / total;
      const bajos = records
        .filter(r => r.riesgo.porcentajeAsistencia < 80)
        .sort((a, b) => a.riesgo.porcentajeAsistencia - b.riesgo.porcentajeAsistencia);
      const lineas = [
        `Asistencia media del grupo: ${media.toFixed(0)}% (${total} estudiante${total === 1 ? '' : 's'}).`,
        `• Por debajo del 80%: ${bajos.length} (${pct(bajos.length, total)})`,
      ];
      if (bajos.length > 0) {
        lineas.push('', 'Los de menor asistencia:');
        lineas.push(
          ...bajos.slice(0, 5).map(
            r =>
              `• ${r.fullName} (cédula ${r.code}): ${r.riesgo.porcentajeAsistencia.toFixed(0)}%` +
              `, ${r.riesgo.clasesAusente} ausencia${r.riesgo.clasesAusente === 1 ? '' : 's'}`,
          ),
        );
      }
      return { pregunta, answer: lineas.join('\n'), source: 'datos' };
    }

    case 'aprobacion': {
      const conNotas = records.filter(r => r.tieneNotas);
      if (conNotas.length === 0) {
        return {
          pregunta,
          answer: 'Todavía no hay notas registradas en ese alcance.',
          source: 'datos',
        };
      }
      const aprobando = conNotas.filter(r => r.riesgo.notaActual >= 3);
      const perdiendo = conNotas
        .filter(r => r.riesgo.notaActual < 3)
        .sort((a, b) => a.riesgo.notaActual - b.riesgo.notaActual);
      const lineas = [
        `Sobre ${conNotas.length} estudiante${conNotas.length === 1 ? '' : 's'} con notas:`,
        `• Aprobando (≥ 3.0): ${aprobando.length} (${pct(aprobando.length, conNotas.length)})`,
        `• Por debajo de 3.0: ${perdiendo.length} (${pct(perdiendo.length, conNotas.length)})`,
      ];
      if (perdiendo.length > 0) {
        lineas.push('', 'Los promedios más bajos:');
        lineas.push(
          ...perdiendo
            .slice(0, 5)
            .map(r => `• ${r.fullName} (cédula ${r.code}): ${r.riesgo.notaActual.toFixed(2)}`),
        );
      }
      if (records.length > conNotas.length) {
        lineas.push('', `${records.length - conNotas.length} sin ninguna nota aún.`);
      }
      return { pregunta, answer: lineas.join('\n'), source: 'datos' };
    }

    case 'necesita': {
      const evaluados = records.map(r => ({
        record: r,
        falta: notaNecesariaEnRestantes(r.cortes),
      }));
      const cerrados = evaluados.filter(e => e.falta.cortesRestantes === 0);
      const abiertos = evaluados.filter(e => e.falta.cortesRestantes > 0);
      const asegurados = abiertos.filter(e => e.falta.requerido === 0);
      const sinAlcance = abiertos.filter(e => e.falta.requerido === null);
      const enJuego = abiertos
        .filter(e => e.falta.requerido !== null && e.falta.requerido > 0)
        .sort((a, b) => (b.falta.requerido ?? 0) - (a.falta.requerido ?? 0));

      const lineas = [`Para aprobar con 3.0 (${total} estudiante${total === 1 ? '' : 's'}):`];
      if (asegurados.length > 0) {
        lineas.push(
          `• Ya lo aseguran con lo acumulado: ${asegurados.length} (${pct(asegurados.length, total)})`,
        );
      }
      if (enJuego.length > 0) {
        const media =
          enJuego.reduce((s, e) => s + (e.falta.requerido ?? 0), 0) / enJuego.length;
        lineas.push(
          `• Con la materia en juego: ${enJuego.length} (${pct(enJuego.length, total)}), ` +
            `necesitan ${media.toFixed(2)} de media en lo que falta`,
        );
      }
      if (sinAlcance.length > 0) {
        lineas.push(
          `• Ya no alcanzan ni con 5.0 en lo restante: ${sinAlcance.length} (${pct(sinAlcance.length, total)})`,
        );
      }
      if (cerrados.length > 0) {
        const aprobaron = cerrados.filter(e => e.falta.aprobado).length;
        lineas.push(
          `• Con los tres cortes cerrados: ${cerrados.length} (aprobaron ${aprobaron}, perdieron ${cerrados.length - aprobaron})`,
        );
      }
      if (enJuego.length > 0) {
        lineas.push('', 'Los que más necesitan:');
        lineas.push(
          ...enJuego.slice(0, 5).map(
            e =>
              `• ${e.record.fullName} (cédula ${e.record.code}): necesita ` +
              `${e.falta.requerido?.toFixed(2)} en ${
                e.falta.cortesRestantes === 1
                  ? 'el corte que falta'
                  : `los ${e.falta.cortesRestantes} cortes que faltan`
              }`,
          ),
        );
      }
      return { pregunta, answer: lineas.join('\n'), source: 'datos' };
    }
  }
}
