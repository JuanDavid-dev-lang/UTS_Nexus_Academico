/**
 * Scheduler en proceso para tareas recurrentes (sin dependencias externas).
 * Hoy: escaneo automático de riesgo académico. Se activa con
 * RISK_SCAN_INTERVAL_MIN > 0. En despliegues multi-instancia, activarlo en una
 * sola instancia o migrar a un cron externo que llame a POST /notifications/risks/scan.
 */
import { env } from './env.js';
import { generateRiskNotifications } from '../modules/notifications/risk-notifier.service.js';

let timer: NodeJS.Timeout | null = null;

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
