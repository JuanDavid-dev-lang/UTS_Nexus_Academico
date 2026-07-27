import 'dotenv/config';

export const env = {
  PORT: Number(process.env.PORT ?? 4000),
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
};

