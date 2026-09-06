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
  /**
   * `1` cuando hay un proxy inverso delante (Caddy, Nginx, un túnel).
   *
   * Activa `trust proxy`, que es lo que hace que el limitador de tasa vea la IP
   * real del cliente en vez de la del proxy.
   *
   * Sin declarar, cae en `NODE_ENV === 'production'`, que es lo que hacía antes
   * — el despliegue que ya funciona detrás de Caddy no cambia de
   * comportamiento. Lo que añade la variable es poder decirlo **cuando
   * `NODE_ENV` no está puesto**, que era el caso en el que el limitador
   * quedaba contando a toda la institución como un solo cliente.
   *
   * Y poder apagarlo importa igual: con `trust proxy` y sin proxy delante,
   * cualquiera manda su propia cabecera `X-Forwarded-For` y estrena cupo de
   * intentos de login en cada petición.
   */
  TRUST_PROXY: process.env.TRUST_PROXY
    ? ['1', 'true', 'yes'].includes(process.env.TRUST_PROXY.toLowerCase())
    : process.env.NODE_ENV === 'production',
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
  // Un aviso programado se publica por fecha, no por minuto: revisar cada 5
  // basta y cada pasada es una consulta por indice.
  ANNOUNCEMENT_PUBLISH_INTERVAL_MIN: Number(process.env.ANNOUNCEMENT_PUBLISH_INTERVAL_MIN ?? 5),
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

  // ── Puente con UniPlanner (Firestore REST) ─────────────────────────────
  // La clave de cada institución **no** vive aquí: es `Institucion.institutionId`
  // en la base, que es el identificador estable que el propio modelo declara
  // como «el que usará UniPlanner». En una variable de entorno el despliegue
  // entero quedaría clavado a una sola universidad, y este backend ya sirve a
  // varias.
  //
  // Sin las tres credenciales el canal queda desactivado y se anota en el log,
  // igual que el push y el correo: nadie debería necesitar una cuenta de
  // servicio de otro proyecto para levantar esto en local. La lista de clase
  // sigue funcionando; lo que desaparece es la insignia de enlazado y el botón
  // de avisar.
  UNIPLANNER_PROJECT_ID: process.env.UNIPLANNER_PROJECT_ID ?? '',
  UNIPLANNER_CLIENT_EMAIL: process.env.UNIPLANNER_CLIENT_EMAIL ?? '',
  /** Clave privada de la cuenta de servicio. Admite los `\n` escapados del JSON. */
  UNIPLANNER_PRIVATE_KEY: (process.env.UNIPLANNER_PRIVATE_KEY ?? '').replace(/\\n/g, '\n'),
  /**
   * Solo se escribe a enlaces confirmados.
   *
   * Apagado por defecto porque hoy nadie confirma ninguno y encenderlo dejaría
   * el canal mudo. Existe para el día que haya un proceso de verificación: el
   * nombre del documento de enlace es calculable, así que hasta entonces una
   * cuenta puede reclamar el código de otra persona y recibir sus avisos. Ver
   * `docs/UNIPLANNER.md`.
   */
  UNIPLANNER_SOLO_VERIFICADOS: ['1', 'true', 'si', 'yes'].includes(
    (process.env.UNIPLANNER_SOLO_VERIFICADOS ?? '0').toLowerCase(),
  ),

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
  /**
   * Secreto compartido con el servicio de ML. Viaja en la cabecera `X-ML-Secret`.
   *
   * Vacío en local: el servicio tampoco lo exige mientras escuche solo en la
   * loopback, así que un `git clone` arranca sin configurar nada. En cuanto se
   * expone —`ML_HOST` fuera de `127.0.0.1`— el propio servicio se niega a
   * arrancar sin él, porque `POST /train` reentrena el modelo que decide qué
   * estudiantes salen en rojo y `/vision/*` acepta archivos.
   *
   * Tiene que ser **el mismo valor** que `ML_SHARED_SECRET` en el entorno del
   * servicio de Python.
   */
  ML_SHARED_SECRET: process.env.ML_SHARED_SECRET ?? '',
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

  /**
   * Devuelve el código de recuperación **en la respuesta HTTP** de
   * `/auth/recovery/request`. Apagado salvo que se pida explícitamente.
   *
   * Antes esto se deducía de «no es producción y no hay SMTP», y esa deducción
   * era el último eslabón de una cadena fea: un despliegue sin `NODE_ENV` ni
   * `SMTP_HOST` convertía la ruta en una toma de cuenta de un solo paso —basta
   * conocer un correo, que está en el directorio— sin que nadie hubiera
   * decidido nada. Deducir un permiso a partir de dos ausencias es lo contrario
   * de conceder un permiso.
   *
   * Con una variable propia sigue siendo cómodo desarrollar sin servidor de
   * correo, pero hay que escribirlo, y se ve en el `.env`.
   */
  ALLOW_DEV_RECOVERY_CODE: ['1', 'true', 'yes'].includes(
    (process.env.ALLOW_DEV_RECOVERY_CODE ?? '').toLowerCase(),
  ),

  /** `production` activa las comprobaciones de abajo. */
  NODE_ENV: process.env.NODE_ENV ?? 'development',
};

export const esProduccion = env.NODE_ENV === 'production';

/**
 * ¿Estamos ante una instalación real, aunque nadie haya declarado `NODE_ENV`?
 *
 * Esta pregunta existe por un fallo concreto de diseño que tuvo esta función.
 * `validarProduccion()` empezaba con `if (!esProduccion) return`, es decir: el
 * guardián que impide desplegar con los secretos de juguete **solo se activaba
 * si ya estaba puesta la variable que él mismo tendría que verificar**. Un
 * `pm2 start` sin `NODE_ENV`, un `systemd` sin `Environment=` o un contenedor
 * al que se le olvidó la variable arrancaban sin un solo aviso con
 * `JWT_ACCESS_SECRET = 'dev-access'` — que está escrito en este repositorio, o
 * sea que cualquiera puede firmarse un token con `role: 'ADMIN'`.
 *
 * La señal de que esto no es un clon recién hecho es que haya una base de datos
 * configurada: nadie apunta `MONGODB_URI` a un clúster de verdad para trastear.
 * Con esa señal, las comprobaciones que no cuestan nada en desarrollo se hacen
 * SIEMPRE, y `NODE_ENV` deja de ser el interruptor de la seguridad para volver
 * a ser lo que debe: el interruptor del rendimiento y del formato del log.
 */
const hayBaseConfigurada = Boolean(process.env.MONGODB_URI);

/**
 * Comprueba que la configuración sea segura antes de aceptar una sola petición.
 *
 * Falla y detiene el arranque en vez de avisar y seguir. Un servidor que
 * arranca «con advertencias» queda funcionando meses con la advertencia en un
 * log que nadie lee, y aquí lo que está en juego son las cédulas y las notas de
 * los estudiantes. Es preferible que el despliegue se caiga ruidosamente el
 * primer día a que quede abierto en silencio.
 *
 * Dos niveles, a propósito:
 *
 *  - **Siempre** (haya o no `NODE_ENV=production`): los secretos de firma. Un
 *    secreto de juguete no es una molestia de configuración, es una cuenta de
 *    administrador regalada, y no hay ninguna razón para tolerarlo en una
 *    instalación que ya tiene base de datos.
 *  - **Solo en producción**: lo que sí molestaría en local — CORS acotado y
 *    servidor de correo. Ahí `NODE_ENV` sigue siendo la señal correcta.
 */
export function validarProduccion(): void {
  const fallos: string[] = [];

  // ── Siempre que haya una base configurada ────────────────────────────────
  if (hayBaseConfigurada || esProduccion) {
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
  }

  // ── Solo en producción declarada ─────────────────────────────────────────
  if (esProduccion) {
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
  }

  if (fallos.length > 0) {
    console.error('\n[config] El servidor NO va a arrancar. Corrige esto en el entorno:\n');
    for (const fallo of fallos) console.error(`  · ${fallo}`);
    if (!esProduccion) {
      console.error(
        '\n  (Estas comprobaciones se hacen aunque NODE_ENV no sea "production" porque\n' +
          '   hay una MONGODB_URI configurada: no es un clon recién hecho.)',
      );
    }
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
