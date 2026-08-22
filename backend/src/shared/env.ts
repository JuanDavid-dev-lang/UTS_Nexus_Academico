import 'dotenv/config';

/**
 * Configuración del proceso.
 *
 * Los valores por defecto existen para que un `git clone` arranque sin
 * configurar nada, y eso está bien en una máquina de desarrollo. En un servidor
 * expuesto a internet son un peligro: `validarProduccion()` se encarga de que
 * ninguno de los peligrosos sobreviva ahí.
 */

/** Secretos de juguete. Sirven en local; en producción son una puerta abierta. */
const SECRETOS_DE_DESARROLLO = new Set(['dev-access', 'dev-refresh', 'changeme', 'secret']);

export const env = {
  PORT: Number(process.env.PORT ?? 4000),
  /** Interfaz de escucha. En local todas; detrás de un proxy, solo la loopback. */
  HOST: process.env.HOST ?? '0.0.0.0',
  MONGODB_URI: process.env.MONGODB_URI ?? '',
  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET ?? 'dev-access',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET ?? 'dev-refresh',
  ACCESS_TOKEN_TTL: process.env.ACCESS_TOKEN_TTL ?? '15m',
  REFRESH_TOKEN_TTL: process.env.REFRESH_TOKEN_TTL ?? '30d',
  CLIENT_ORIGIN: process.env.CLIENT_ORIGIN ?? '*',
  /** Minutos entre escaneos automáticos de riesgo. 0 = desactivado. */
  RISK_SCAN_INTERVAL_MIN: Number(process.env.RISK_SCAN_INTERVAL_MIN ?? 0),

  // ── Agenda académica ───────────────────────────────────────────────────
  /**
   * Desfase del campus respecto a UTC, en minutos. Colombia: -300, sin horario
   * de verano.
   *
   * "10:00" en un horario son las diez de la mañana en el campus, no las diez
   * del reloj del servidor. Si la hora se resolviera con la zona del proceso,
   * un backend en un contenedor UTC pondría esa clase a las 5:00 en el teléfono
   * del docente y el recordatorio llegaría cinco horas tarde.
   */
  CAMPUS_UTC_OFFSET_MIN: Number(process.env.CAMPUS_UTC_OFFSET_MIN ?? -300),
  /**
   * Minutos entre pasadas del recordatorio de clases. 0 = desactivado.
   *
   * Va a 1 por defecto —al revés que el escaneo de riesgo— porque un aviso de
   * "empieza en 15 minutos" que se comprueba cada cuarto de hora no es un
   * aviso: la pasada es una consulta acotada a la ventana siguiente, no un
   * recorrido de todos los estudiantes.
   */
  CLASS_REMINDER_INTERVAL_MIN: Number(process.env.CLASS_REMINDER_INTERVAL_MIN ?? 1),

  // ── Actividades y patrones de asistencia ───────────────────────────────
  /**
   * Minutos entre pasadas del aviso de vencimiento de actividades. 0 = apagado.
   *
   * Quince y no uno: las antelaciones son de 48 h, 24 h y 2 h, así que una
   * precisión de un cuarto de hora sobra. Y la ventana de disparo se calcula a
   * partir de este valor, de modo que subirlo no pierde avisos: solo los
   * adelanta como mucho ese mismo cuarto de hora.
   */
  ACTIVITY_DUE_INTERVAL_MIN: Number(process.env.ACTIVITY_DUE_INTERVAL_MIN ?? 15),
  /**
   * Minutos entre escaneos de patrones de inasistencia. 0 = apagado.
   *
   * Va a 0 por defecto, al revés que los recordatorios: la pasada recorre la
   * asistencia de todos los estudiantes del alcance, así que en una
   * instalación local recién clonada no debería arrancar sola. Se activa en el
   * servidor, y con varias instancias, en una sola.
   */
  ATTENDANCE_PATTERN_INTERVAL_MIN: Number(process.env.ATTENDANCE_PATTERN_INTERVAL_MIN ?? 0),
  /**
   * Días que se conserva un error de cliente ya resuelto. 0 = para siempre.
   *
   * La telemetría es diagnóstico, no archivo histórico: un defecto arreglado
   * hace medio año no ayuda a nadie y sí engorda la colección.
   */
  TELEMETRY_RETENTION_DAYS: Number(process.env.TELEMETRY_RETENTION_DAYS ?? 90),

  // ── Notificaciones push (Firebase Cloud Messaging, API HTTP v1) ─────────
  // Sin las tres variables el envío queda desactivado y se anota en el log,
  // igual que el correo: una instalación local no debería necesitar una cuenta
  // de servicio de Google para arrancar. Los recordatorios de clase siguen
  // llegando al teléfono porque Android los programa como alarmas locales.
  FCM_PROJECT_ID: process.env.FCM_PROJECT_ID ?? '',
  FCM_CLIENT_EMAIL: process.env.FCM_CLIENT_EMAIL ?? '',
  /** Clave privada de la cuenta de servicio. Admite los `\n` escapados del JSON. */
  FCM_PRIVATE_KEY: (process.env.FCM_PRIVATE_KEY ?? '').replace(/\\n/g, '\n'),
  /** URL del servidor de IA local (Ollama). */
  AI_BASE_URL: process.env.AI_BASE_URL ?? 'http://localhost:11434',
  /** Modelo de Ollama para el asistente académico. */
  AI_MODEL: process.env.AI_MODEL ?? 'llama3.1:8b',
  /** Habilita el chatbot con IA local. '0'/'false' lo desactiva (modo reglas). */
  AI_ENABLED: !['0', 'false', 'no', ''].includes((process.env.AI_ENABLED ?? '1').toLowerCase()),
  /** Servicio de predicción de riesgo (Python + scikit-learn). */
  ML_BASE_URL: process.env.ML_BASE_URL ?? 'http://127.0.0.1:8100',
  /** '0' lo desactiva y el backend usa solo el motor de reglas. */
  ML_ENABLED: !['0', 'false', 'no'].includes((process.env.ML_ENABLED ?? '1').toLowerCase()),
  // ── Correo saliente ────────────────────────────────────────────────────
  // Sin SMTP_HOST el envío queda desactivado y se registra en el log, igual
  // que hace el servicio ML: una instalación local no debería tener que
  // configurar un servidor de correo para arrancar.
  SMTP_HOST: process.env.SMTP_HOST ?? '',
  SMTP_PORT: Number(process.env.SMTP_PORT ?? 587),
  SMTP_USER: process.env.SMTP_USER ?? '',
  SMTP_PASS: process.env.SMTP_PASS ?? '',
  SMTP_FROM: process.env.SMTP_FROM ?? 'UTS Nexus Académico <no-reply@uts.edu.co>',
  /** `1` fuerza TLS directo (puerto 465). Por defecto STARTTLS. */
  SMTP_SECURE: ['1', 'true', 'yes'].includes((process.env.SMTP_SECURE ?? '').toLowerCase()),

  /** Repositorio público de instaladores que se consulta para avisar de versiones. */
  RELEASES_REPO: process.env.RELEASES_REPO ?? 'JuanDavid-dev-lang/UTS_Nexus_Releases',
  /** Horas entre comprobaciones de versión nueva. 0 = desactivado. */
  RELEASE_CHECK_INTERVAL_H: Number(process.env.RELEASE_CHECK_INTERVAL_H ?? 0),

  /** `production` activa las comprobaciones de abajo. */
  NODE_ENV: process.env.NODE_ENV ?? 'development',
};

export const esProduccion = env.NODE_ENV === 'production';

/**
 * Comprueba que la configuración sea segura antes de aceptar una sola petición.
 *
 * Falla y detiene el arranque en vez de avisar y seguir. Un servidor que
 * arranca «con advertencias» queda funcionando meses con la advertencia en un
 * log que nadie lee, y aquí lo que está en juego son las cédulas y las notas de
 * los estudiantes. Es preferible que el despliegue se caiga ruidosamente el
 * primer día a que quede abierto en silencio.
 */
export function validarProduccion(): void {
  if (!esProduccion) return;

  const fallos: string[] = [];

  if (SECRETOS_DE_DESARROLLO.has(env.JWT_ACCESS_SECRET) || env.JWT_ACCESS_SECRET.length < 32) {
    // El valor por defecto está escrito en un repositorio público: con él,
    // cualquiera puede fabricarse un token de administrador válido.
    fallos.push('JWT_ACCESS_SECRET falta, es el de desarrollo o tiene menos de 32 caracteres.');
  }
  if (SECRETOS_DE_DESARROLLO.has(env.JWT_REFRESH_SECRET) || env.JWT_REFRESH_SECRET.length < 32) {
    fallos.push('JWT_REFRESH_SECRET falta, es el de desarrollo o tiene menos de 32 caracteres.');
  }
  if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
    // Con un solo secreto, un token de acceso caducado sirve como refresh.
    fallos.push('JWT_ACCESS_SECRET y JWT_REFRESH_SECRET no pueden ser iguales.');
  }
  if (!env.MONGODB_URI) {
    fallos.push('MONGODB_URI es obligatoria.');
  }
  if (env.CLIENT_ORIGIN === '*') {
    fallos.push(
      'CLIENT_ORIGIN no puede ser "*" en producción: indica los orígenes permitidos separados por coma.',
    );
  }
  if (!env.SMTP_HOST) {
    fallos.push('SMTP_HOST es obligatorio en producción para recuperar contraseñas.');
  }

  if (fallos.length > 0) {
    console.error('\n[config] El servidor NO va a arrancar. Corrige esto en el entorno:\n');
    for (const fallo of fallos) console.error(`  · ${fallo}`);
    console.error(
      '\nGenera secretos con:  node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64url\'))"\n',
    );
    process.exit(1);
  }
}

/** Orígenes permitidos por CORS, ya separados. `*` solo sobrevive fuera de producción. */
export function origenesPermitidos(): string[] | '*' {
  if (env.CLIENT_ORIGIN === '*') return '*';
  return env.CLIENT_ORIGIN.split(',')
    .map(origen => origen.trim())
    .filter(Boolean);
}
