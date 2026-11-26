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
import { env } from './env.js';
import { resumirError } from './sanitize.js';
import { duracionDelTurnoMs, filtroDeTurno } from './turno-tarea.js';

export type NombreTarea =
  | 'risk-scan'
  | 'class-reminders'
  | 'activity-due'
  | 'attendance-patterns'
  | 'seguimiento-recordatorios'
  | 'release-check'
  | 'announcement-publish'
  | 'uniplanner-solicitudes'
  | 'uniplanner-verificacion';

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
  if (!env.JOBS_ENABLED) {
    avisarUnaVez(job, 'tareas periódicas desactivadas en esta instancia (JOBS_ENABLED=0).');
    return null;
  }
  if (!(await tomarTurno(job))) {
    avisarUnaVez(job, 'la ejecuta otra instancia; esta se la salta mientras dure su turno.');
    return null;
  }
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

/**
 * Identifica a esta instancia por su host, no por su pid: un despliegue
 * reinicia el proceso, y con el pid el nuevo encontraba el turno del muerto
 * vigente y se saltaba las tareas durante dos intervalos y medio. Dos procesos
 * en la misma máquina contra la misma base no es una configuración soportada.
 */
const QUIEN = os.hostname();

/** Suelta los turnos de esta instancia al apagarse, para que otra los tome ya. */
export async function liberarTurnos(): Promise<void> {
  try {
    await JobRunModel.updateMany({ leaseHolder: QUIEN }, { $set: { leaseUntil: null } });
  } catch (causa) {
    console.error('[tareas] no se pudieron soltar los turnos al apagar:', causa);
  }
}

/** Minutos entre pasadas de cada tarea, para dimensionar su turno. */
function intervaloMin(job: NombreTarea): number {
  switch (job) {
    case 'risk-scan':
    case 'seguimiento-recordatorios':
      return env.RISK_SCAN_INTERVAL_MIN;
    case 'class-reminders':
      return env.CLASS_REMINDER_INTERVAL_MIN;
    case 'activity-due':
      return env.ACTIVITY_DUE_INTERVAL_MIN;
    case 'attendance-patterns':
      return env.ATTENDANCE_PATTERN_INTERVAL_MIN;
    case 'announcement-publish':
      return env.ANNOUNCEMENT_PUBLISH_INTERVAL_MIN;
    case 'release-check':
      return env.RELEASE_CHECK_INTERVAL_H * 60;
    case 'uniplanner-solicitudes':
      return 5;
    case 'uniplanner-verificacion':
      return 1;
  }
}

/**
 * Reclama (o renueva) el turno de la tarea para esta instancia.
 *
 * Si la base falla al reclamarlo se ejecuta igual: es lo que pasaba antes del
 * turno, y la pasada registrará su propio error. Saltarla en silencio dejaría
 * el centro de salud sin saber que la base no responde.
 */
async function tomarTurno(job: NombreTarea): Promise<boolean> {
  const ahora = new Date();
  try {
    await JobRunModel.findOneAndUpdate(
      filtroDeTurno(job, QUIEN, ahora),
      { $set: { leaseHolder: QUIEN, leaseUntil: new Date(ahora.getTime() + duracionDelTurnoMs(intervaloMin(job))) } },
      { upsert: true },
    );
    yaAvisado.delete(job);
    return true;
  } catch (causa) {
    if ((causa as { code?: number }).code === 11000) return false;
    console.error(`[tarea:${job}] no se pudo reclamar el turno:`, causa);
    return true;
  }
}

/** Un aviso por tarea y estado: con tareas de cada minuto, repetirlo inundaría el log. */
const yaAvisado = new Set<NombreTarea>();
function avisarUnaVez(job: NombreTarea, mensaje: string): void {
  if (yaAvisado.has(job)) return;
  yaAvisado.add(job);
  console.info(`[tarea:${job}] ${mensaje}`);
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
