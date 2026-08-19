/**
 * Registro persistente de las tareas periódicas.
 *
 * El centro de salud pregunta «¿cuándo corrió esto por última vez?» y esa
 * respuesta no puede salir de una variable del proceso: con dos instancias, la
 * que atiende la consulta no tiene por qué ser la que ejecutó la tarea, y
 * contestaría «nunca» sobre algo que sí corrió hace un minuto.
 *
 * Igual que la auditoría, **nunca tumba la tarea que registra**. Que no se
 * pueda anotar una pasada no es motivo para que la pasada falle.
 */
import os from 'node:os';
import { JobRunModel } from '../models/job-run.model.js';
import { resumirError } from './sanitize.js';

export type NombreTarea =
  | 'risk-scan'
  | 'class-reminders'
  | 'activity-due'
  | 'attendance-patterns'
  | 'release-check';

/**
 * Ejecuta una tarea y deja constancia del resultado.
 *
 * Devuelve lo que devolvió la tarea, o `null` si falló: el llamador decide si
 * eso le importa. El error se registra en el documento y se relanza al log,
 * pero no se propaga, porque quien llama es un `setInterval` sin nadie que lo
 * atienda.
 */
export async function ejecutarTarea<T extends Record<string, unknown>>(
  job: NombreTarea,
  tarea: () => Promise<T>,
): Promise<T | null> {
  const inicio = Date.now();
  try {
    const resultado = await tarea();
    await anotar(job, {
      lastRunAt: new Date(),
      lastSuccessAt: new Date(),
      lastDurationMs: Date.now() - inicio,
      lastResult: resultado,
      lastError: null,
    });
    return resultado;
  } catch (causa) {
    const mensaje = resumirError(causa);
    console.error(`[tarea:${job}] falló:`, causa);
    await anotar(job, {
      lastRunAt: new Date(),
      lastDurationMs: Date.now() - inicio,
      lastError: mensaje,
      lastErrorAt: new Date(),
    });
    return null;
  }
}

async function anotar(job: NombreTarea, campos: Record<string, unknown>): Promise<void> {
  try {
    const fallo = campos.lastError != null;
    await JobRunModel.findOneAndUpdate(
      { job },
      {
        $set: { ...campos, lastHost: os.hostname() },
        $inc: { runs: 1, failures: fallo ? 1 : 0 },
      },
      { upsert: true },
    );
  } catch (causa) {
    console.error(`[tarea:${job}] no se pudo registrar la ejecución:`, causa);
  }
}

/** Estado de todas las tareas, para el centro de salud. */
export async function leerEjecuciones(): Promise<Record<string, unknown>[]> {
  return JobRunModel.find({}).sort({ job: 1 }).lean() as Promise<Record<string, unknown>[]>;
}
