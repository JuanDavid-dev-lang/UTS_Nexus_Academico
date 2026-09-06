/**
 * Puente con UniPlanner: lee el enlace de un estudiante y le escribe en su
 * buzón.
 *
 * **Sin dependencias nuevas.** UniPlanner vive en Firestore, y en vez de
 * arrastrar `firebase-admin` entero para dos llamadas, se firma la aserción de
 * la cuenta de servicio con `jsonwebtoken` —que ya está aquí por el login—, se
 * cambia por un access token en el endpoint OAuth de Google y se habla con la
 * API REST de Firestore. Es exactamente lo que hace `push.ts` con FCM.
 *
 * Un access token de cuenta de servicio **no pasa por las reglas de seguridad**
 * de Firestore: son para los SDK de cliente. Por eso Nexus puede escribir en un
 * buzón donde la propia app del estudiante tiene prohibido crear nada, que es
 * justo lo que hace del buzón un canal de la institución y no otro cuaderno más
 * de la app.
 *
 * Si no está configurado, todo aquí es un no-op declarado: `configurado()`
 * devuelve `false` y el llamador responde que el canal está apagado. La lista
 * de clase sigue funcionando sin insignias.
 *
 * Configuración en `backend/.env` — ver `docs/UNIPLANNER.md`.
 */
import jwt from 'jsonwebtoken';
import { env } from './env.js';
import type { Aviso } from '../domains/uniplanner/message.js';

const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/datastore';

/** Colección de nivel superior donde UniPlanner guarda los enlaces. */
const COLECCION_ENLACES = 'institution_links';
/** Subcolección del buzón dentro de `users/{uid}`. */
const COLECCION_BUZON = 'institutional_inbox';

/**
 * Cuántos enlaces se piden de una vez.
 *
 * `batchGet` acepta más, pero una lista de clase son treinta o cuarenta
 * estudiantes y trocear en cien deja el peor caso en una sola petición.
 */
const TAM_LOTE = 100;

export type EnlaceUniPlanner = {
  /** Cuenta de UniPlanner a la que escribir. */
  uid: string;
  /** Código con el que la persona se enlazó, ya normalizado. */
  studentCode: string;
  /** Si la institución confirmó que ese código es de esa persona. */
  verified: boolean;
};

let avisadoSinConfigurar = false;

export function configurado(): boolean {
  return Boolean(
    env.UNIPLANNER_PROJECT_ID && env.UNIPLANNER_CLIENT_EMAIL && env.UNIPLANNER_PRIVATE_KEY,
  );
}

function avisarUnaVez(): void {
  if (avisadoSinConfigurar) return;
  console.info(
    '[uniplanner] sin configurar: no se leen enlaces ni se escriben avisos en la app del estudiante.',
  );
  avisadoSinConfigurar = true;
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
        iss: env.UNIPLANNER_CLIENT_EMAIL,
        scope: SCOPE,
        aud: OAUTH_TOKEN_URL,
        iat: ahora,
        exp: ahora + 3600,
      },
      env.UNIPLANNER_PRIVATE_KEY,
      { algorithm: 'RS256' },
    );
  } catch (err) {
    // Clave mal pegada (los `\n` sin escapar es el caso habitual).
    console.error(
      '[uniplanner] no se pudo firmar la aserción:',
      err instanceof Error ? err.message : err,
    );
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
      console.error(
        `[uniplanner] OAuth respondió ${respuesta.status}: ${await respuesta.text().catch(() => '')}`,
      );
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
    console.error(
      '[uniplanner] no se pudo obtener el token:',
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

async function accessToken(): Promise<string | null> {
  if (tokenCache && tokenCache.expiraEn > Date.now()) return tokenCache.valor;
  // Un solo vuelo: cuarenta estudiantes de una lista no deben pedir cuarenta
  // tokens.
  tokenEnVuelo ??= pedirAccessToken().finally(() => {
    tokenEnVuelo = null;
  });
  return tokenEnVuelo;
}

// ── Codificación de valores de Firestore ─────────────────────────────────────
//
// La API REST no acepta JSON a secas: cada valor va etiquetado con su tipo.
// Es la parte aburrida de no usar el SDK, y la única.

type ValorFirestore = Record<string, unknown>;

function aValor(valor: unknown): ValorFirestore {
  if (valor === null || valor === undefined) return { nullValue: null };
  if (valor instanceof Date) return { timestampValue: valor.toISOString() };
  if (typeof valor === 'boolean') return { booleanValue: valor };
  if (typeof valor === 'number') {
    if (!Number.isFinite(valor)) return { nullValue: null };
    // Un entero va como entero: en la app se lee con `is num`, así que las dos
    // formas valen, pero un `integerValue` no arrastra el error de coma
    // flotante de escribir 3 como 3.0000000000000004.
    return Number.isInteger(valor)
      ? { integerValue: String(valor) }
      : { doubleValue: valor };
  }
  if (typeof valor === 'string') return { stringValue: valor };
  if (Array.isArray(valor)) {
    return { arrayValue: { values: valor.map(aValor) } };
  }
  if (typeof valor === 'object') {
    return { mapValue: { fields: aCampos(valor as Record<string, unknown>) } };
  }
  return { stringValue: String(valor) };
}

function aCampos(objeto: Record<string, unknown>): Record<string, ValorFirestore> {
  const campos: Record<string, ValorFirestore> = {};
  for (const [clave, valor] of Object.entries(objeto)) {
    // `undefined` se omite en vez de escribirse como null: un campo ausente y
    // un campo a null se leen distinto en la app.
    if (valor === undefined) continue;
    campos[clave] = aValor(valor);
  }
  return campos;
}

function texto(campos: Record<string, ValorFirestore> | undefined, clave: string): string {
  const valor = campos?.[clave] as { stringValue?: unknown } | undefined;
  return typeof valor?.stringValue === 'string' ? valor.stringValue : '';
}

function booleano(campos: Record<string, ValorFirestore> | undefined, clave: string): boolean {
  const valor = campos?.[clave] as { booleanValue?: unknown } | undefined;
  return valor?.booleanValue === true;
}

// ── Llamadas ─────────────────────────────────────────────────────────────────

function raizDocumentos(): string {
  return `projects/${env.UNIPLANNER_PROJECT_ID}/databases/(default)/documents`;
}

function urlBase(): string {
  return `https://firestore.googleapis.com/v1/${raizDocumentos()}`;
}

function enlaceDesde(campos: Record<string, ValorFirestore> | undefined): EnlaceUniPlanner | null {
  const uid = texto(campos, 'uid');
  if (!uid) return null;
  return {
    uid,
    studentCode: texto(campos, 'studentCode'),
    verified: booleano(campos, 'verified'),
  };
}

/**
 * Los enlaces de una tanda de identificadores, por id.
 *
 * Devuelve un mapa para que el llamador no tenga que casar posiciones: los
 * documentos que no existen simplemente no aparecen, y eso es exactamente lo
 * que significa «este estudiante no tiene UniPlanner».
 */
export async function buscarEnlaces(ids: readonly string[]): Promise<Map<string, EnlaceUniPlanner>> {
  const encontrados = new Map<string, EnlaceUniPlanner>();
  const unicos = [...new Set(ids.filter(Boolean))];
  if (unicos.length === 0) return encontrados;

  if (!configurado()) {
    avisarUnaVez();
    return encontrados;
  }

  const token = await accessToken();
  if (!token) return encontrados;

  const url = `https://firestore.googleapis.com/v1/${raizDocumentos()}:batchGet`;

  for (let i = 0; i < unicos.length; i += TAM_LOTE) {
    const lote = unicos.slice(i, i + TAM_LOTE);
    try {
      const respuesta = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documents: lote.map((id) => `${raizDocumentos()}/${COLECCION_ENLACES}/${id}`),
        }),
        signal: AbortSignal.timeout(15_000),
      });

      if (!respuesta.ok) {
        console.warn(
          `[uniplanner] batchGet respondió ${respuesta.status}: ${(await respuesta.text().catch(() => '')).slice(0, 200)}`,
        );
        continue;
      }

      const filas = (await respuesta.json()) as {
        found?: { name?: string; fields?: Record<string, ValorFirestore> };
      }[];

      for (const fila of filas) {
        const nombre = fila.found?.name;
        if (!nombre) continue;
        const id = nombre.slice(nombre.lastIndexOf('/') + 1);
        const enlace = enlaceDesde(fila.found?.fields);
        if (enlace) encontrados.set(id, enlace);
      }
    } catch (err) {
      console.warn(
        '[uniplanner] fallo leyendo enlaces:',
        err instanceof Error ? err.message : err,
      );
    }
  }

  return encontrados;
}

/** El enlace de un solo identificador, o `null`. */
export async function buscarEnlace(id: string): Promise<EnlaceUniPlanner | null> {
  return (await buscarEnlaces([id])).get(id) ?? null;
}

export type ResultadoEnvio =
  | { ok: true; id: string }
  | { ok: false; motivo: 'sin-configurar' | 'sin-token' | 'rechazado' | 'red' };

/**
 * Escribe un aviso en el buzón de una cuenta.
 *
 * `institutionId` llega como argumento y no de la configuración: es la clave
 * del perfil institucional de quien dicta la materia
 * (`Institucion.institutionId`), y en un despliegue con varias universidades no
 * hay una sola respuesta correcta que pudiera vivir en una variable.
 *
 * `sentAt` lo pone **el reloj de Nexus**, no el del servidor de Firestore: la
 * API REST solo sabe poner una marca de servidor dentro de un `commit` con
 * transformaciones, y aquí el que escribe es el propio autor del mensaje, así
 * que su reloj es la fecha del hecho. Importa que exista y no cuál sea, porque
 * el buzón se lee ordenado por ese campo y **Firestore deja fuera de una
 * consulta ordenada todo documento que no lo tenga**: un aviso sin `sentAt` se
 * escribiría sin error y no lo vería nadie nunca.
 */
export async function escribirAviso(
  uid: string,
  institutionId: string,
  aviso: Aviso,
): Promise<ResultadoEnvio> {
  if (!configurado()) {
    avisarUnaVez();
    return { ok: false, motivo: 'sin-configurar' };
  }

  const token = await accessToken();
  if (!token) return { ok: false, motivo: 'sin-token' };

  const documento = {
    type: aviso.type,
    source: 'nexus',
    institutionId,
    courseCode: aviso.courseCode,
    courseName: aviso.courseName,
    teacherName: aviso.teacherName,
    term: aviso.term,
    message: aviso.message,
    sentAt: new Date(),
    expiresAt: aviso.expiresAt,
    payload: aviso.payload,
  };

  const url = `${urlBase()}/users/${encodeURIComponent(uid)}/${COLECCION_BUZON}`;

  try {
    const respuesta = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: aCampos(documento) }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!respuesta.ok) {
      console.warn(
        `[uniplanner] el buzón rechazó el aviso (${respuesta.status}): ${(await respuesta.text().catch(() => '')).slice(0, 200)}`,
      );
      return { ok: false, motivo: 'rechazado' };
    }

    const creado = (await respuesta.json()) as { name?: string };
    const nombre = creado.name ?? '';
    return { ok: true, id: nombre.slice(nombre.lastIndexOf('/') + 1) };
  } catch (err) {
    console.warn(
      '[uniplanner] fallo de red escribiendo el aviso:',
      err instanceof Error ? err.message : err,
    );
    return { ok: false, motivo: 'red' };
  }
}

/** Para las pruebas: olvida el token cacheado. */
export function _reiniciarTokenParaPruebas(): void {
  tokenCache = null;
  tokenEnVuelo = null;
}
