/**
 * Scheduler en proceso para tareas recurrentes (sin dependencias externas).
 * Hoy: escaneo automático de riesgo académico. Se activa con
 * RISK_SCAN_INTERVAL_MIN > 0. En despliegues multi-instancia, activarlo en una
 * sola instancia o migrar a un cron externo que llame a POST /notifications/risks/scan.
 */
import { env } from './env.js';
import { generateRiskNotifications } from '../modules/notifications/risk-notifier.service.js';
import { notificarVersionNueva } from '../modules/notifications/release-notifier.service.js';
import { generarRecordatorios } from '../modules/notifications/class-reminder.service.js';
import { generarAvisosDeVencimiento } from '../modules/activities/activity-due.service.js';
import { escanearPatronesDeAsistencia } from '../modules/attendance/attendance-patterns.service.js';
import { recordarSeguimientosPendientes } from '../modules/analytics/seguimiento-reminder.service.js';
import { ejecutarTarea } from './job-run.js';

let timer: NodeJS.Timeout | null = null;
let releaseTimer: NodeJS.Timeout | null = null;
let recordatoriosTimer: NodeJS.Timeout | null = null;
let actividadesTimer: NodeJS.Timeout | null = null;
let patronesTimer: NodeJS.Timeout | null = null;

/**
 * Comprobación periódica de versión nueva.
 *
 * Se separa del escaneo de riesgo porque su ritmo es otro: el riesgo interesa
 * cada pocas horas, una publicación cada varias. Compartir intervalo obligaría
 * a elegir el más agresivo de los dos y a consultar GitHub sin motivo.
 */
export function startReleaseWatcher() {
  if (releaseTimer) return;
  const horas = env.RELEASE_CHECK_INTERVAL_H;
  if (!horas || horas <= 0) {
    console.log('Aviso de versiones desactivado (RELEASE_CHECK_INTERVAL_H=0).');
    return;
  }

  const run = async () => {
    const resultado = await ejecutarTarea('release-check', async () => {
      const salida = await notificarVersionNueva();
      return { ...salida } as Record<string, unknown>;
    });
    if (resultado && !resultado.sinCambios) {
      console.log(
        `[version] ${resultado.version}: ${resultado.avisados} docentes avisados` +
          (resultado.correoEnviado ? ' (correo enviado).' : ' (sin correo).')
      );
    }
  };

  releaseTimer = setInterval(run, horas * 60 * 60 * 1000);
  console.log(`Aviso de versiones activo cada ${horas} h.`);
  // Diferido como el de riesgo: el arranque no debe esperar a una petición
  // de red hacia fuera.
  setTimeout(run, 30 * 1000);
}

export function stopReleaseWatcher() {
  if (releaseTimer) {
    clearInterval(releaseTimer);
    releaseTimer = null;
  }
}

/**
 * Recordatorios de clase y de eventos de la agenda.
 *
 * Va por su cuenta y no dentro del escaneo de riesgo porque su ritmo es otro:
 * el riesgo cambia en semanas, un "empieza en 15 minutos" hay que comprobarlo
 * cada minuto o deja de ser un aviso. La pasada mira solo la ventana siguiente,
 * así que su coste no crece con el número de estudiantes.
 *
 * En un despliegue con varias instancias, activarlo en una sola: el `dedupeKey`
 * evita el aviso doble, pero no el trabajo doble.
 */
export function startClassReminders() {
  if (recordatoriosTimer) return;
  const minutos = env.CLASS_REMINDER_INTERVAL_MIN;
  if (!minutos || minutos <= 0) {
    console.log('Recordatorios de clase desactivados (CLASS_REMINDER_INTERVAL_MIN=0).');
    return;
  }

  const run = async () => {
    const resultado = await ejecutarTarea('class-reminders', async () => {
      const salida = await generarRecordatorios();
      return { ...salida };
    });
    if (resultado && Number(resultado.avisos) > 0) {
      console.log(
        `[agenda] ${resultado.avisos} recordatorio(s) enviados ` +
          `(${resultado.clasesRevisadas} clases y ${resultado.eventosRevisados} eventos en ventana).`,
      );
    }
  };

  recordatoriosTimer = setInterval(run, minutos * 60 * 1000);
  console.log(`Recordatorios de clase activos cada ${minutos} min.`);
  // Diferido como los demás: el arranque no debe esperar a una consulta.
  setTimeout(run, 20 * 1000);
}

export function stopClassReminders() {
  if (recordatoriosTimer) {
    clearInterval(recordatoriosTimer);
    recordatoriosTimer = null;
  }
}

/**
 * Avisos de vencimiento de actividades.
 *
 * Va aparte del recordatorio de clases porque su ritmo es otro: una clase se
 * avisa con quince minutos, una entrega con dos días. Compartir intervalo
 * obligaría a elegir el más agresivo y a recorrer las actividades cada minuto
 * para no encontrar nada.
 */
export function startActivityDueWatcher() {
  if (actividadesTimer) return;
  const minutos = env.ACTIVITY_DUE_INTERVAL_MIN;
  if (!minutos || minutos <= 0) {
    console.log('Avisos de vencimiento desactivados (ACTIVITY_DUE_INTERVAL_MIN=0).');
    return;
  }

  const run = async () => {
    const resultado = await ejecutarTarea('activity-due', async () => {
      const salida = await generarAvisosDeVencimiento();
      return { ...salida };
    });
    if (resultado && Number(resultado.avisos) > 0) {
      console.log(
        `[actividades] ${resultado.avisos} aviso(s) de vencimiento ` +
          `(${resultado.proximas} próximas, ${resultado.vencidas} vencidas).`,
      );
    }
  };

  actividadesTimer = setInterval(run, minutos * 60 * 1000);
  console.log(`Avisos de vencimiento activos cada ${minutos} min.`);
  setTimeout(run, 25 * 1000);
}

export function stopActivityDueWatcher() {
  if (actividadesTimer) {
    clearInterval(actividadesTimer);
    actividadesTimer = null;
  }
}

/**
 * Escaneo de patrones de inasistencia.
 *
 * Apagado por defecto, al revés que los recordatorios: la pasada recorre la
 * asistencia de todos los estudiantes del alcance, así que una instalación
 * local recién clonada no debería arrancarla sola. Con varias instancias,
 * activarlo en una: el `dedupeKey` evita el aviso doble, no el trabajo doble.
 */
export function startAttendancePatternScanner() {
  if (patronesTimer) return;
  const minutos = env.ATTENDANCE_PATTERN_INTERVAL_MIN;
  if (!minutos || minutos <= 0) {
    console.log('Escaneo de patrones de inasistencia desactivado (ATTENDANCE_PATTERN_INTERVAL_MIN=0).');
    return;
  }

  const run = async () => {
    const resultado = await ejecutarTarea('attendance-patterns', async () => {
      const salida = await escanearPatronesDeAsistencia();
      return { ...salida };
    });
    if (resultado && Number(resultado.casosAbiertos) + Number(resultado.casosActualizados) > 0) {
      console.log(
        `[asistencia] ${resultado.casosAbiertos} caso(s) nuevo(s) y ` +
          `${resultado.casosActualizados} actualizado(s).`,
      );
    }
  };

  patronesTimer = setInterval(run, minutos * 60 * 1000);
  console.log(`Escaneo de patrones de inasistencia activo cada ${minutos} min.`);
  setTimeout(run, 40 * 1000);
}

export function stopAttendancePatternScanner() {
  if (patronesTimer) {
    clearInterval(patronesTimer);
    patronesTimer = null;
  }
}

export function startScheduler() {
  if (timer) return;
  const minutes = env.RISK_SCAN_INTERVAL_MIN;
  if (!minutes || minutes <= 0) {
    console.log('Scheduler de riesgo desactivado (RISK_SCAN_INTERVAL_MIN=0).');
    return;
  }

  // Envuelto en `ejecutarTarea`: el centro de salud necesita saber cuándo
  // corrió por última vez, y esa respuesta no puede vivir en una variable del
  // proceso — con dos instancias, la que atiende la consulta no es la que
  // ejecutó la tarea y contestaría "nunca" sobre algo que sí corrió.
  const run = async () => {
    const result = await ejecutarTarea('risk-scan', async () => {
      const salida = await generateRiskNotifications();
      return { enRiesgo: salida.enRiesgo, notificaciones: salida.notificaciones };
    });
    if (result) {
      console.log(`[riesgo] escaneo automático: ${result.enRiesgo} en riesgo, ${result.notificaciones} notificaciones.`);
    }

    // Mismo intervalo que el riesgo, tarea aparte: el centro de salud tiene
    // que poder decir cuándo corrió cada una. Un seguimiento abierto hace más
    // de 24 h sin actualizar genera su recordatorio (una sola vez).
    const seguimientos = await ejecutarTarea('seguimiento-recordatorios', async () => {
      return await recordarSeguimientosPendientes();
    });
    if (seguimientos && Number(seguimientos.recordatorios) > 0) {
      console.log(`[seguimiento] ${seguimientos.recordatorios} recordatorio(s) de actualización.`);
    }
  };

  timer = setInterval(run, minutes * 60 * 1000);
  console.log(`Scheduler de riesgo activo cada ${minutes} min.`);
  // Primer escaneo diferido para no bloquear el arranque.
  setTimeout(run, 15 * 1000);
}

export function stopScheduler() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
