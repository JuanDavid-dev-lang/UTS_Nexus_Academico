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

let timer: NodeJS.Timeout | null = null;
let releaseTimer: NodeJS.Timeout | null = null;
let recordatoriosTimer: NodeJS.Timeout | null = null;

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
    try {
      const resultado = await notificarVersionNueva();
      if (!resultado.sinCambios) {
        console.log(
          `[version] ${resultado.version}: ${resultado.avisados} docentes avisados` +
            (resultado.correoEnviado ? ' (correo enviado).' : ' (sin correo).')
        );
      }
    } catch (err) {
      console.error('[version] fallo comprobando publicaciones:', err);
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
    try {
      const resultado = await generarRecordatorios();
      if (resultado.avisos > 0) {
        console.log(
          `[agenda] ${resultado.avisos} recordatorio(s) enviados ` +
            `(${resultado.clasesRevisadas} clases y ${resultado.eventosRevisados} eventos en ventana).`,
        );
      }
    } catch (err) {
      console.error('[agenda] fallo generando recordatorios:', err);
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

export function startScheduler() {
  if (timer) return;
  const minutes = env.RISK_SCAN_INTERVAL_MIN;
  if (!minutes || minutes <= 0) {
    console.log('Scheduler de riesgo desactivado (RISK_SCAN_INTERVAL_MIN=0).');
    return;
  }

  const run = async () => {
    try {
      const result = await generateRiskNotifications();
      console.log(`[riesgo] escaneo automático: ${result.enRiesgo} en riesgo, ${result.notificaciones} notificaciones.`);
    } catch (err) {
      console.error('[riesgo] fallo en escaneo automático:', err);
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
