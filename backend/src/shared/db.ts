import dns from 'node:dns';
import mongoose from 'mongoose';
import { env } from './env.js';

/**
 * Conexión a MongoDB.
 *
 * Dos decisiones deliberadas:
 *
 *  1. Si los resolutores DNS de Node son inservibles, se sustituyen. Node no usa
 *     el resolutor de Windows: trae el suyo (c-ares), y en algunos equipos queda
 *     apuntando a 127.0.0.1 sin que haya nada escuchando ahí. Como las cadenas
 *     `mongodb+srv://` exigen una consulta SRV, la conexión falla con
 *     ECONNREFUSED aunque `nslookup` resuelva perfectamente.
 *
 *  2. Un fallo de conexión NO tumba el proceso. El servidor sigue escuchando y
 *     `/health` informa que la base está caída, para que el cliente pueda decir
 *     "el servidor no alcanza la base de datos" en vez de "no hay servidor".
 *     Son diagnósticos distintos y llevan a soluciones distintas.
 */

/** Resolutores públicos usados solo cuando los del sistema no sirven. */
const FALLBACK_DNS = ['1.1.1.1', '8.8.8.8'];

const isLoopback = (address: string) => /^(127\.|::1$|0\.0\.0\.0$)/.test(address);

function ensureUsableDnsServers(): void {
  const servers = dns.getServers();

  // Solo intervenimos si TODOS son loopback: una configuración válida se respeta.
  if (servers.length > 0 && servers.every(isLoopback)) {
    console.warn(
      `[db] Los resolutores DNS de Node apuntan a ${servers.join(', ')}, donde no hay ningún ` +
        `servidor DNS. Usando ${FALLBACK_DNS.join(', ')} para poder resolver el registro SRV de Atlas.`,
    );
    dns.setServers(FALLBACK_DNS);
  }
}

export type DbStatus = 'disabled' | 'connecting' | 'connected' | 'error';

let status: DbStatus = 'disabled';
let lastError: string | null = null;

export function dbStatus(): { status: DbStatus; error: string | null } {
  // mongoose.connection.readyState manda una vez conectados: refleja caídas
  // posteriores que este módulo no vería.
  if (status === 'connected' && mongoose.connection.readyState !== 1) {
    return { status: 'error', error: 'La conexión con MongoDB se perdió.' };
  }
  return { status, error: lastError };
}

/** Traduce los errores de driver más comunes a algo accionable. */
function explain(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  if (/ECONNREFUSED|querySrv|ENOTFOUND|EAI_AGAIN/.test(message)) {
    return (
      'No se pudo resolver la dirección del clúster de MongoDB (consulta DNS fallida). ' +
      'Revisa tu conexión a internet, o usa la cadena de conexión estándar (mongodb://) ' +
      'en lugar de mongodb+srv:// si tu red bloquea las consultas SRV.'
    );
  }
  if (/Authentication failed|bad auth/i.test(message)) {
    return 'Usuario o contraseña incorrectos en MONGODB_URI.';
  }
  if (/IP that isn't whitelisted|not allowed to connect/i.test(message)) {
    return (
      'Tu IP no está autorizada en MongoDB Atlas. ' +
      'Añádela en Atlas → Network Access → Add IP Address.'
    );
  }
  if (/timed out|ETIMEDOUT/i.test(message)) {
    return 'El clúster de MongoDB no respondió a tiempo. Revisa tu conexión o el estado de Atlas.';
  }
  return message;
}

/**
 * Conexión para scripts (seed, migraciones, smoke).
 *
 * A diferencia de `connectDb`, esta SÍ lanza: un script que no puede conectarse
 * debe fallar de inmediato y con un mensaje claro, no continuar a medias.
 * Comparte el arreglo de DNS, que es justo lo que faltaba cuando los scripts
 * abrían la conexión por su cuenta.
 */
export async function connectDbOrThrow(): Promise<void> {
  if (!env.MONGODB_URI) {
    throw new Error('MONGODB_URI no está definida en backend/.env.');
  }

  ensureUsableDnsServers();
  mongoose.set('strictQuery', true);

  try {
    await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });
    status = 'connected';
    lastError = null;
  } catch (error) {
    status = 'error';
    lastError = explain(error);
    throw new Error(lastError);
  }
}

export async function connectDb(): Promise<void> {
  if (!env.MONGODB_URI) {
    status = 'disabled';
    lastError = 'MONGODB_URI no está definida en backend/.env.';
    console.warn(`[db] ${lastError} El servidor arrancará, pero las consultas fallarán.`);
    return;
  }

  ensureUsableDnsServers();
  mongoose.set('strictQuery', true);
  status = 'connecting';

  try {
    await mongoose.connect(env.MONGODB_URI, {
      // Sin esto, una base caída deja las consultas colgadas 10 s en la cola
      // interna de Mongoose y el error que llega al usuario es incomprensible.
      serverSelectionTimeoutMS: 10_000,
      bufferCommands: false,
    });
    status = 'connected';
    lastError = null;
    console.log(`[db] Conectado a MongoDB (${mongoose.connection.name}).`);
  } catch (error) {
    status = 'error';
    lastError = explain(error);
    // No relanzamos: el servidor debe escuchar igual para poder reportar el fallo.
    console.error(`[db] No se pudo conectar: ${lastError}`);
  }
}
