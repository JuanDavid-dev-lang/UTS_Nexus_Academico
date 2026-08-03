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
