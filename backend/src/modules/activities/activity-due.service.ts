/**
 * Avisos de vencimiento de actividades.
 *
 * Corre en el scheduler (`ACTIVITY_DUE_INTERVAL_MIN`). En cada pasada mira solo
 * la ventana siguiente y las que acaban de vencer: no recorre estudiantes ni
 * recalcula nada académico, así que su coste no crece con la institución.
 *
 * **Idempotente por la clave, no por un candado.** Cada aviso se identifica por
 * «esta actividad, esta antelación»; dos pasadas solapadas, un reinicio a
 * mitad de minuto o dos instancias del backend escriben la misma clave y el
 * índice único parcial `(userId, dedupeKey)` deja pasar una sola. Sin eso, el
 * escáner crearía un aviso idéntico cada vez, que es la forma más rápida de
 * enseñar a un docente a ignorar la campana.
 */
import { ActivityModel } from '../../models/activity.model.js';
import { SubjectModel } from '../../models/subject.model.js';
import { crearNotificacion } from '../../shared/notify.js';
import {
  ANTELACIONES_HORAS,
  antelacionesADisparar,
  claveAviso,
  textoAntelacion,
  type AntelacionHoras,
} from '../../domains/activities/activity-status.js';
import { env } from '../../shared/env.js';

export type ResultadoAvisos = {
  revisadas: number;
  proximas: number;
  vencidas: number;
  avisos: number;
  duplicados: number;
};

/** Horas hacia atrás en las que una actividad recién vencida sigue avisándose. */
const VENTANA_VENCIDAS_H = 24;

/**
 * Genera los avisos que toquen ahora mismo.
 *
 * Devuelve contadores y nunca lanza por «no procedía»: que un docente haya
 * apagado la categoría de eventos no es un error del escáner.
 */
export async function generarAvisosDeVencimiento(
  ahora: Date = new Date(),
): Promise<ResultadoAvisos> {
  const ventanaMinutos = Math.max(1, env.ACTIVITY_DUE_INTERVAL_MIN || 15);
  const maxAntelacion = Math.max(...ANTELACIONES_HORAS);

  // Solo lo que puede disparar algo: abierto, y con la fecha límite dentro de
  // la mayor antelación hacia delante o de la ventana de vencidas hacia atrás.
  const desde = new Date(ahora.getTime() - VENTANA_VENCIDAS_H * 3600_000);
  const hasta = new Date(ahora.getTime() + maxAntelacion * 3600_000);

  const actividades = await ActivityModel.find({
    deletedAt: null,
    status: { $ne: 'CLOSED' },
    dueAt: { $gte: desde, $lte: hasta },
  })
    .select('_id title subjectId groupId teacherId dueAt period')
    .lean();

  if (actividades.length === 0) {
    return { revisadas: 0, proximas: 0, vencidas: 0, avisos: 0, duplicados: 0 };
  }

  // Un solo viaje por los nombres de materia: `find` por cada actividad
  // convertiría una pasada de cincuenta entregas en cincuenta consultas.
  const materias = await SubjectModel.find({
    _id: { $in: [...new Set(actividades.map(a => String(a.subjectId)))] },
  })
    .select('name')
    .lean();
  const nombreDeMateria = new Map(materias.map(m => [String(m._id), String(m.name ?? '')]));

  let proximas = 0;
  let vencidas = 0;
  let avisos = 0;
  let duplicados = 0;

  for (const actividad of actividades) {
    const id = String(actividad._id);
    const docente = String(actividad.teacherId ?? '');
    if (!docente) continue;

    const materia = nombreDeMateria.get(String(actividad.subjectId)) ?? 'la materia';
    const limite = new Date(actividad.dueAt as Date);
    // El enlace lleva a la actividad concreta, no al listado: un aviso que
    // obliga a repetir a mano la búsqueda que él mismo hizo no sirve de nada.
    const link = `/actividades?item=${id}`;

    // ── Próxima a vencer ────────────────────────────────────────────────
    for (const horas of antelacionesADisparar(limite, ahora, ventanaMinutos)) {
      proximas += 1;
      const resultado = await crearNotificacion({
        userId: docente,
        type: 'DEADLINE',
        priority: horas <= 2 ? 'IMPORTANT' : 'INFO',
        title: `Entrega ${textoAntelacion(horas as AntelacionHoras)}: ${actividad.title}`,
        message: `${materia} · vence el ${formatearFecha(limite)}.`,
        dedupeKey: claveAviso(id, horas as AntelacionHoras),
        link,
        metadata: { activityId: id, subjectId: String(actividad.subjectId), dueAt: limite.toISOString() },
      });
      if (resultado.creada) avisos += 1;
      else if (resultado.omitida === 'duplicada') duplicados += 1;
    }

    // ── Vencida y todavía abierta ───────────────────────────────────────
    if (limite.getTime() < ahora.getTime()) {
      vencidas += 1;
      const resultado = await crearNotificacion({
        userId: docente,
        type: 'DEADLINE',
        priority: 'IMPORTANT',
        title: `Actividad vencida sin cerrar: ${actividad.title}`,
        message: `${materia} · venció el ${formatearFecha(limite)} y sigue abierta.`,
        dedupeKey: claveAviso(id, 'vencida'),
        link,
        metadata: { activityId: id, subjectId: String(actividad.subjectId), vencida: true },
      });
      if (resultado.creada) avisos += 1;
      else if (resultado.omitida === 'duplicada') duplicados += 1;
    }
  }

  return { revisadas: actividades.length, proximas, vencidas, avisos, duplicados };
}

/**
 * Fecha en hora de pared del campus.
 *
 * Formatear con la zona del proceso pondría «vence el 3 a las 19:00» en un
 * servidor UTC para una entrega que el docente fijó a las 14:00 del campus, y
 * la diferencia se leería como un fallo del sistema, no como un desfase.
 */
function formatearFecha(instante: Date): string {
  const local = new Date(instante.getTime() + env.CAMPUS_UTC_OFFSET_MIN * 60_000);
  const dia = String(local.getUTCDate()).padStart(2, '0');
  const mes = String(local.getUTCMonth() + 1).padStart(2, '0');
  const hora = String(local.getUTCHours()).padStart(2, '0');
  const minuto = String(local.getUTCMinutes()).padStart(2, '0');
  return `${dia}/${mes} ${hora}:${minuto}`;
}
