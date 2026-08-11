/**
 * Envío de notificaciones push a Android (Firebase Cloud Messaging, HTTP v1).
 *
 * Sin dependencias nuevas: el token de acceso se firma con `jsonwebtoken` —que
 * ya está en el proyecto por el login— contra la cuenta de servicio, se cambia
 * por un access token en el endpoint OAuth de Google y se cachea hasta poco
 * antes de que expire. La alternativa era arrastrar `firebase-admin` entero
 * (y `google-auth-library` con él) para usar una sola llamada HTTP.
 *
 * Si no está configurado, todo aquí es un no-op declarado: `pushConfigurado()`
 * devuelve `false`, el llamador sigue creando la notificación en la base y en
 * el socket, y el teléfono la ve al abrir la app o por su alarma local. Es la
 * misma degradación silenciosa y a propósito que el correo saliente.
 *
 * Configuración en `backend/.env` — ver `docs/AGENDA_Y_NOTIFICACIONES.md`:
 *   FCM_PROJECT_ID=mi-proyecto
 *   FCM_CLIENT_EMAIL=...@...iam.gserviceaccount.com
 *   FCM_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
 */
import jwt from 'jsonwebtoken';
import { env } from './env.js';

const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

export type PushPayload = {
  title: string;
  body: string;
  /** Datos que el cliente usa para navegar al tocar. Todo string: FCM lo exige. */
  data?: Record<string, string>;
  /**
   * Agrupa en el cajón de Android. Dos avisos del mismo hecho se reemplazan en
   * vez de apilarse — el `tag` de la notificación de Android.
   */
  collapseKey?: string;
  priority?: 'high' | 'normal';
  /** Canal de Android. Debe existir en el cliente o el sistema lo ignora. */
  androidChannelId?: string;
};

export type ResultadoPush = {
  enviados: number;
  fallidos: number;
  /** Tokens que FCM declaró muertos: el llamador debe borrarlos. */
  tokensInvalidos: string[];
  motivo?: string;
};

const VACIO: ResultadoPush = { enviados: 0, fallidos: 0, tokensInvalidos: [] };

let avisadoSinConfigurar = false;

export function pushConfigurado(): boolean {
  return Boolean(env.FCM_PROJECT_ID && env.FCM_CLIENT_EMAIL && env.FCM_PRIVATE_KEY);
}

// ── Token de acceso, cacheado ────────────────────────────────────────────────
let tokenCache: { valor: string; expiraEn: number } | null = null;
let tokenEnVuelo: Promise<string | null> | null = null;

async function pedirAccessToken(): Promise<string | null> {
  const ahora = Math.floor(Date.now() / 1000);

  let assertion: string;
  try {
    assertion = jwt.sign(
      {
        iss: env.FCM_CLIENT_EMAIL,
        scope: SCOPE,
        aud: OAUTH_TOKEN_URL,
        iat: ahora,
        exp: ahora + 3600,
      },
      env.FCM_PRIVATE_KEY,
      { algorithm: 'RS256' },
    );
  } catch (err) {
    // Clave mal pegada (los `\n` sin escapar es el caso habitual).
    console.error('[push] no se pudo firmar la aserción de FCM:', err instanceof Error ? err.message : err);
    return null;
  }

  try {
    const respuesta = await fetch(OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!respuesta.ok) {
      console.error(`[push] OAuth respondió ${respuesta.status}: ${await respuesta.text().catch(() => '')}`);
      return null;
    }

    const datos = (await respuesta.json()) as { access_token?: string; expires_in?: number };
    if (!datos.access_token) return null;

    // Se renueva 5 min antes de caducar: una petición que sale justo en el
    // límite llegaría con el token ya muerto.
    tokenCache = {
      valor: datos.access_token,
      expiraEn: Date.now() + Math.max(60, (datos.expires_in ?? 3600) - 300) * 1000,
    };
    return datos.access_token;
  } catch (err) {
    console.error('[push] no se pudo obtener el token de FCM:', err instanceof Error ? err.message : err);
    return null;
  }
}

async function accessToken(): Promise<string | null> {
  if (tokenCache && tokenCache.expiraEn > Date.now()) return tokenCache.valor;
  // Un solo vuelo: veinte envíos simultáneos no deben pedir veinte tokens.
  tokenEnVuelo ??= pedirAccessToken().finally(() => {
    tokenEnVuelo = null;
  });
  return tokenEnVuelo;
}

/** Códigos con los que FCM dice "este token ya no existe". */
function tokenMuerto(estado: number, cuerpo: string): boolean {
  if (estado === 404) return true;
  if (estado !== 400 && estado !== 403) return false;
  return /UNREGISTERED|INVALID_ARGUMENT|SENDER_ID_MISMATCH/i.test(cuerpo);
}

/**
 * Envía a una lista de tokens. Uno por petición: la API HTTP v1 retiró el envío
 * por lotes, y con el número de dispositivos que tiene un docente (uno o dos)
 * paralelizar de más solo añadiría formas de fallar.
 */
export async function enviarPush(tokens: readonly string[], payload: PushPayload): Promise<ResultadoPush> {
  const unicos = [...new Set(tokens.filter(Boolean))];
  if (unicos.length === 0) return VACIO;

  if (!pushConfigurado()) {
    if (!avisadoSinConfigurar) {
      console.log('[push] FCM sin configurar: no se envían notificaciones al teléfono con la app cerrada.');
      avisadoSinConfigurar = true;
    }
    return { ...VACIO, motivo: 'sin-configurar' };
  }

  const token = await accessToken();
  if (!token) return { ...VACIO, fallidos: unicos.length, motivo: 'sin-token' };

  const url = `https://fcm.googleapis.com/v1/projects/${env.FCM_PROJECT_ID}/messages:send`;
  const resultado: ResultadoPush = { enviados: 0, fallidos: 0, tokensInvalidos: [] };

  for (const destino of unicos) {
    const mensaje = {
      message: {
        token: destino,
        // `notification` la pinta Android aunque la app esté cerrada; `data`
        // viaja siempre y es lo que el cliente usa para navegar al tocar.
        notification: { title: payload.title, body: payload.body },
        data: payload.data ?? {},
        android: {
          priority: payload.priority === 'normal' ? 'NORMAL' : 'HIGH',
          ...(payload.collapseKey ? { collapse_key: payload.collapseKey } : {}),
          notification: {
            channel_id: payload.androidChannelId ?? 'uts_academico',
            ...(payload.collapseKey ? { tag: payload.collapseKey } : {}),
          },
        },
      },
    };

    try {
      const respuesta = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(mensaje),
        signal: AbortSignal.timeout(10_000),
      });

      if (respuesta.ok) {
        resultado.enviados += 1;
        continue;
      }

      const cuerpo = await respuesta.text().catch(() => '');
      resultado.fallidos += 1;
      if (tokenMuerto(respuesta.status, cuerpo)) resultado.tokensInvalidos.push(destino);
      else console.warn(`[push] FCM respondió ${respuesta.status}: ${cuerpo.slice(0, 200)}`);
    } catch (err) {
      resultado.fallidos += 1;
      console.warn('[push] fallo de red enviando a FCM:', err instanceof Error ? err.message : err);
    }
  }

  return resultado;
}
