import { Schema, model } from 'mongoose';

/**
 * Última ejecución de cada tarea periódica.
 *
 * El centro de salud tiene que responder «¿cuándo se comprobó el riesgo por
 * última vez?», y esa respuesta no puede vivir en una variable del proceso:
 * con dos instancias detrás de un balanceador, la que atiende la consulta no
 * es necesariamente la que ejecutó la tarea, y contestaría «nunca» sobre algo
 * que sí corrió. Persistido, cualquiera de las dos dice la verdad.
 *
 * Un documento por tarea, sobrescrito en cada pasada. No es un historial largo
 * a propósito: guardar cada minuto del recordatorio de clases sería más
 * escritura que el trabajo que registra.
 */
const schema = new Schema(
  {
    /** `risk-scan`, `class-reminders`, `activity-due`, `attendance-patterns`, `release-check`. */
    job: { type: String, required: true, unique: true, index: true },
    lastRunAt: { type: Date, default: null },
    lastSuccessAt: { type: Date, default: null },
    /** Duración de la última pasada, en milisegundos. */
    lastDurationMs: { type: Number, default: 0 },
    /** Resumen de lo que hizo (contadores), nunca datos personales. */
    lastResult: { type: Object, default: {} },
    /** Último error ya saneado. Se conserva aunque después haya pasadas buenas. */
    lastError: { type: String, default: null },
    lastErrorAt: { type: Date, default: null },
    runs: { type: Number, default: 0 },
    failures: { type: Number, default: 0 },
    /** Qué instancia la ejecutó; con varias, evita presentar un dato local como global. */
    lastHost: { type: String, default: '' },
  },
  { timestamps: true },
);

export const JobRunModel = model('EjecucionTarea', schema, 'ejecuciones_tareas');
