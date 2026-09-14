/**
 * Puente con UniPlanner: lee el enlace de un estudiante, le escribe en su
 * buzón y lee las marcas de la asistencia por QR.
 *
 * Las marcas son **lo único que viaja de UniPlanner hacia aquí**, y con forma
 * fija: el texto del QR, un identificador del teléfono y la hora que sella
 * Firestore. Nada de lo que el estudiante guarda en su app tiene por dónde
 * llegar (`docs/UNIPLANNER.md` §8).
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
/** Sesiones de asistencia por QR que Nexus publica. */
const COLECCION_SESIONES = 'attendance_sessions';
/** Marcas de los estudiantes, dentro de cada sesión: `{sesion}/checkins/{uid}`. */
const COLECCION_MARCAS = 'checkins';
/** Campo del enlace que dice hasta cuándo no se puede soltar. */
const CAMPO_BLOQUEO = 'lockedUntil';

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
  /** Si la institución confirmó que ese documento es de esa persona. */
  verified: boolean;
  /** Nombre completo que escribió la persona al enlazarse. Vacío en enlaces anteriores. */
  nombre: string;
  /** Resultado de la verificación automática, si ya pasó por ella. */
  estadoVerificacion: 'verified' | 'not_matched' | null;
  /**
   * Hasta cuándo no se puede soltar el enlace. Lo escribe Nexus al marcar
   * asistencia con él (`lockedUntil`); la app no puede tocarlo.
   */
  bloqueadoHasta: Date | null;
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

function fecha(campos: Record<string, ValorFirestore> | undefined, clave: string): Date | null {
  const valor = campos?.[clave] as { timestampValue?: unknown } | undefined;
  if (typeof valor?.timestampValue !== 'string') return null;
  const instante = new Date(valor.timestampValue);
  return Number.isNaN(instante.getTime()) ? null : instante;
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
  const estado = texto(campos, 'verificationStatus');
  return {
    uid,
    studentCode: texto(campos, 'studentCode'),
    verified: booleano(campos, 'verified'),
    nombre: texto(campos, 'fullName').slice(0, 120),
    estadoVerificacion: estado === 'verified' || estado === 'not_matched' ? estado : null,
    bloqueadoHasta: fecha(campos, CAMPO_BLOQUEO),
  };
}

/**
 * Enlaces que pidieron verificarse desde `desde`, en orden.
 *
 * UniPlanner sella `verificationRequestedAt` con la hora del servidor al crear
 * el enlace y cada vez que la persona corrige su nombre, así que leer por ese
 * campo trae **solo lo nuevo**: con miles de enlaces, cada pasada lee los que
 * cambiaron desde la anterior y ninguno más. `>=` y no `>` para no perder dos
 * del mismo instante; el llamador descarta los que ya vio.
 */
export async function leerEnlacesPorVerificar(
  desde: Date | null,
  limite = 200,
): Promise<{ ok: true; enlaces: (EnlaceUniPlanner & { id: string; pedidoEn: Date })[] } | { ok: false }> {
  if (!configurado()) {
    avisarUnaVez();
    return { ok: false };
  }
  const token = await accessToken();
  if (!token) return { ok: false };

  const consulta: Record<string, unknown> = {
    from: [{ collectionId: COLECCION_ENLACES }],
    orderBy: [{ field: { fieldPath: 'verificationRequestedAt' }, direction: 'ASCENDING' }],
    limit: limite,
  };
  if (desde) {
    consulta.where = {
      fieldFilter: {
        field: { fieldPath: 'verificationRequestedAt' },
        op: 'GREATER_THAN_OR_EQUAL',
        value: { timestampValue: desde.toISOString() },
      },
    };
  }

  try {
    const respuesta = await fetch(`${urlBase()}:runQuery`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ structuredQuery: consulta }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!respuesta.ok) {
      console.warn(
        `[uniplanner] no se pudieron leer los enlaces por verificar (${respuesta.status}): ` +
          (await respuesta.text().catch(() => '')).slice(0, 200),
      );
      return { ok: false };
    }
    const filas = (await respuesta.json()) as {
      document?: { name?: string; fields?: Record<string, ValorFirestore> };
    }[];
    const enlaces: (EnlaceUniPlanner & { id: string; pedidoEn: Date })[] = [];
    for (const fila of filas) {
      const nombre = fila.document?.name ?? '';
      const enlace = enlaceDesde(fila.document?.fields);
      const pedidoEn = fecha(fila.document?.fields, 'verificationRequestedAt');
      if (!enlace || !pedidoEn) continue;
      enlaces.push({ ...enlace, id: nombre.slice(nombre.lastIndexOf('/') + 1), pedidoEn });
    }
    return { ok: true, enlaces };
  } catch (err) {
    console.warn('[uniplanner] fallo de red leyendo enlaces por verificar:', err instanceof Error ? err.message : err);
    return { ok: false };
  }
}

/**
 * Escribe el resultado de la verificación automática en un enlace.
 *
 * `verified` solo se pone, nunca se quita desde aquí: un enlace que la
 * institución verificó a mano no deja de estarlo porque la comprobación
 * automática no case (por ejemplo, un nombre que la universidad tiene mal
 * escrito). Quitarla es una acción de la pantalla de Vínculos.
 */
export async function escribirVerificacion(linkId: string, estado: 'verified' | 'not_matched'): Promise<boolean> {
  const ahora = new Date();
  return escribirCampos(
    `${COLECCION_ENLACES}/${linkId}`,
    estado === 'verified'
      ? { verified: true, verifiedAt: ahora, verificationStatus: estado, verificationCheckedAt: ahora }
      : { verificationStatus: estado, verificationCheckedAt: ahora },
    { soloSiExiste: true },
  );
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
 *
 * Con `id`, el aviso tiene nombre fijo y **se escribe una sola vez**: si ya
 * existe, Firestore contesta 409 y eso cuenta como enviado. Es para los avisos
 * que dos procesos pueden disparar a la vez por el mismo hecho (la
 * verificación de un enlace).
 */
export async function escribirAviso(
  uid: string,
  institutionId: string,
  aviso: Aviso,
  id?: string,
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

  const url =
    `${urlBase()}/users/${encodeURIComponent(uid)}/${COLECCION_BUZON}` +
    (id ? `?documentId=${encodeURIComponent(id)}` : '');

  try {
    const respuesta = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: aCampos(documento) }),
      signal: AbortSignal.timeout(15_000),
    });

    if (id && respuesta.status === 409) return { ok: true, id };
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

// ── Asistencia por QR ────────────────────────────────────────────────────────
//
// El único dato que viaja de UniPlanner hacia aquí, y con forma fija: la marca
// que deja un estudiante al escanear. Todo lo demás de este archivo escribe
// hacia allá. El contrato completo está en `docs/UNIPLANNER.md` §8.

/**
 * Escribe los campos dados de un documento, sin tocar los demás.
 *
 * Con `soloSiExiste`, un documento que ya no está no se crea: contestar a una
 * marca que el estudiante borró, o fijar un enlace que se deshizo, dejaría un
 * documento huérfano con solo esos campos — y un enlace sin `uid` es un enlace
 * que nadie puede reclamar.
 */
async function escribirCampos(
  ruta: string,
  campos: Record<string, unknown>,
  opciones: { soloSiExiste?: boolean } = {},
): Promise<boolean> {
  if (!configurado()) {
    avisarUnaVez();
    return false;
  }
  const token = await accessToken();
  if (!token) return false;

  const params = new URLSearchParams();
  for (const clave of Object.keys(campos)) params.append('updateMask.fieldPaths', clave);
  if (opciones.soloSiExiste) params.append('currentDocument.exists', 'true');

  try {
    const respuesta = await fetch(`${urlBase()}/${ruta}?${params.toString()}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      // Un campo `undefined` va en la máscara y `aCampos` lo deja fuera del
      // cuerpo: así Firestore lo **borra**. No es lo mismo que `null` para las
      // reglas de UniPlanner.
      body: JSON.stringify({ fields: aCampos(campos) }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!respuesta.ok) {
      console.warn(
        `[uniplanner] no se pudo escribir ${ruta.split('/')[0]} (${respuesta.status}): ` +
          (await respuesta.text().catch(() => '')).slice(0, 200),
      );
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[uniplanner] fallo de red escribiendo:', err instanceof Error ? err.message : err);
    return false;
  }
}

export type SesionPublicada = {
  institutionId: string;
  courseCode: string;
  courseName: string;
  group: string;
  teacherName: string;
  term: string;
  startsAt: Date;
  closesAt: Date;
};

/**
 * Publica una sesión para que UniPlanner la encuentre al escanear.
 *
 * Es lo que las reglas de allí consultan antes de dejar crear una marca: sin
 * sesión abierta, la marca ni se escribe. Y es de donde la app saca el nombre
 * de la materia y del docente, que no caben en el QR sin volverlo ilegible
 * desde el fondo del salón.
 */
export async function publicarSesion(id: string, sesion: SesionPublicada): Promise<boolean> {
  return escribirCampos(`${COLECCION_SESIONES}/${id}`, {
    source: 'nexus',
    ...sesion,
    open: true,
    closedAt: null,
  });
}

/** Marca la sesión como cerrada: desde aquí las reglas no admiten marcas nuevas. */
export async function cerrarSesionPublicada(id: string, cerradaEn: Date): Promise<boolean> {
  return escribirCampos(
    `${COLECCION_SESIONES}/${id}`,
    { open: false, closedAt: cerradaEn },
    { soloSiExiste: true },
  );
}

export type MarcaLeida = {
  uid: string;
  qr: string;
  deviceId: string;
  /** `request.time` de Firestore: las reglas exigen que `createdAt` sea eso. */
  creadaEn: Date;
  /** Cuándo pulsó «Confirmar». También la pone el servidor de Firestore. */
  confirmadaEn: Date | null;
};

/**
 * Las marcas de una sesión desde `desde` (incluido), ordenadas por `campo`.
 *
 * Con `createdAt` trae las marcas nuevas; con `confirmedAt`, las que se
 * acaban de confirmar. Son dos consultas porque confirmar es una edición de un
 * documento que ya existía, y una consulta por fecha de creación no vuelve a
 * verlo.
 *
 * `>=` y no `>`: dos marcas con el mismo sello no son imposibles, y con `>` la
 * segunda se perdería si la anterior lectura se cortó justo entre las dos. El
 * llamador descarta las que ya procesó.
 *
 * Filtro y orden van sobre el mismo campo de una subcolección, así que basta
 * el índice de campo único que Firestore crea solo: no hace falta declarar un
 * índice compuesto en el proyecto de UniPlanner.
 */
export async function leerMarcas(
  sesionId: string,
  desde: Date | null,
  campo: 'createdAt' | 'confirmedAt' = 'createdAt',
  limite = 200,
): Promise<{ ok: true; marcas: MarcaLeida[] } | { ok: false }> {
  if (!configurado()) {
    avisarUnaVez();
    return { ok: false };
  }
  const token = await accessToken();
  if (!token) return { ok: false };

  const consulta: Record<string, unknown> = {
    from: [{ collectionId: COLECCION_MARCAS }],
    orderBy: [{ field: { fieldPath: campo }, direction: 'ASCENDING' }],
    limit: limite,
  };
  if (desde) {
    consulta.where = {
      fieldFilter: {
        field: { fieldPath: campo },
        op: 'GREATER_THAN_OR_EQUAL',
        value: { timestampValue: desde.toISOString() },
      },
    };
  }

  try {
    const respuesta = await fetch(`${urlBase()}/${COLECCION_SESIONES}/${sesionId}:runQuery`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ structuredQuery: consulta }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!respuesta.ok) {
      console.warn(
        `[uniplanner] no se pudieron leer las marcas (${respuesta.status}): ` +
          (await respuesta.text().catch(() => '')).slice(0, 200),
      );
      return { ok: false };
    }

    const filas = (await respuesta.json()) as {
      document?: { name?: string; fields?: Record<string, ValorFirestore> };
    }[];

    const marcas: MarcaLeida[] = [];
    for (const fila of filas) {
      const campos = fila.document?.fields;
      const nombre = fila.document?.name ?? '';
      const creadaEn = fecha(campos, 'createdAt');
      // El `uid` es el nombre del documento: las reglas exigen que coincida con
      // el campo y con quien la crea. Si no coinciden, no es una marca de nadie.
      const uid = nombre.slice(nombre.lastIndexOf('/') + 1);
      if (!campos || !creadaEn || !uid || texto(campos, 'uid') !== uid) continue;
      marcas.push({
        uid,
        qr: texto(campos, 'qr').slice(0, 256),
        deviceId: texto(campos, 'deviceId').slice(0, 64),
        creadaEn,
        confirmadaEn: fecha(campos, 'confirmedAt'),
      });
    }
    return { ok: true, marcas };
  } catch (err) {
    console.warn('[uniplanner] fallo de red leyendo marcas:', err instanceof Error ? err.message : err);
    return { ok: false };
  }
}

export type RespuestaMarca = {
  status: 'accepted' | 'rejected';
  /** Código del motivo, para que la app lo traduzca. */
  reason: string | null;
  /** El mismo motivo en español, por si la app no conoce el código. */
  message: string;
};

/**
 * Contesta en la propia marca, que es lo que el estudiante está mirando.
 *
 * Nexus escribe con la cuenta de servicio, que no pasa por las reglas: la app
 * no puede escribir `status`, así que una marca que dice «aceptada» solo pudo
 * escribirla este servidor.
 */
export async function responderMarca(
  sesionId: string,
  uid: string,
  respuesta: RespuestaMarca,
): Promise<boolean> {
  return escribirCampos(
    `${COLECCION_SESIONES}/${sesionId}/${COLECCION_MARCAS}/${encodeURIComponent(uid)}`,
    { ...respuesta, stage: 'done', processedAt: new Date() },
    { soloSiExiste: true },
  );
}

export type VistaPrevia = {
  /** Nombre del estudiante tal y como lo tiene la universidad. */
  studentName: string;
  /** Documento con todo menos los cuatro últimos caracteres tapados. */
  studentDocument: string;
  courseName: string;
  courseCode: string;
  group: string;
  startTime: string;
  teacherName: string;
};

/**
 * Le enseña a la persona quién es para la universidad y en qué clase va a
 * quedar presente, **antes** de registrar nada.
 *
 * Solo la ve ella: la marca vive bajo su uid y las reglas no dejan leerla a
 * nadie más. Con `stage: 'preview'` la app le ofrece confirmar; hasta que lo
 * haga, no se escribe ninguna asistencia.
 */
export async function responderVistaPrevia(
  sesionId: string,
  uid: string,
  vista: VistaPrevia,
): Promise<boolean> {
  return escribirCampos(
    `${COLECCION_SESIONES}/${sesionId}/${COLECCION_MARCAS}/${encodeURIComponent(uid)}`,
    { stage: 'preview', preview: vista, previewAt: new Date() },
    { soloSiExiste: true },
  );
}

/**
 * Fija un enlace hasta `hasta`.
 *
 * Mientras la fecha no pase, las reglas de UniPlanner no dejan borrarlo: quien
 * marca asistencia con un documento no puede cambiarlo por el de un compañero,
 * marcar por él y volver al suyo.
 */
export async function bloquearEnlace(linkId: string, hasta: Date): Promise<boolean> {
  return escribirCampos(`${COLECCION_ENLACES}/${linkId}`, { [CAMPO_BLOQUEO]: hasta }, { soloSiExiste: true });
}

/**
 * Confirma —o retira la confirmación de— que un enlace es de quien lo tiene.
 *
 * Es lo que la app enseña como «Verificado». La app no puede escribirlo: lo
 * pone quien comprobó la matrícula con credenciales de servidor, y aquí eso es
 * la institución desde «Vínculos UniPlanner» (`vinculos.service.ts`).
 */
export async function marcarVerificacion(linkId: string, verificado: boolean): Promise<boolean> {
  return escribirCampos(
    `${COLECCION_ENLACES}/${linkId}`,
    { verified: verificado, verifiedAt: verificado ? new Date() : null },
    { soloSiExiste: true },
  );
}

// ── Gestión institucional de enlaces y solicitudes ──────────────────────────
//
// La pantalla «Vínculos de UniPlanner» del escritorio lee y cambia enlaces de
// una universidad entera. Se consulta **al abrirla**, no con un listener: lo
// que hay que decidir aquí no cambia cada segundo.

/** Colección donde el estudiante pide a su universidad que revise su enlace. */
const COLECCION_SOLICITUDES = 'link_requests';

/** Un valor de Firestore convertido a JavaScript. */
function aPlano(valor: ValorFirestore | undefined): unknown {
  if (!valor) return null;
  if ('stringValue' in valor) return valor.stringValue;
  if ('booleanValue' in valor) return valor.booleanValue;
  if ('integerValue' in valor) return Number(valor.integerValue);
  if ('doubleValue' in valor) return Number(valor.doubleValue);
  if ('timestampValue' in valor) {
    const fecha = new Date(String(valor.timestampValue));
    return Number.isNaN(fecha.getTime()) ? null : fecha;
  }
  if ('mapValue' in valor) {
    const campos = (valor.mapValue as { fields?: Record<string, ValorFirestore> }).fields ?? {};
    return Object.fromEntries(Object.entries(campos).map(([k, v]) => [k, aPlano(v)]));
  }
  if ('arrayValue' in valor) {
    const valores = (valor.arrayValue as { values?: ValorFirestore[] }).values ?? [];
    return valores.map(aPlano);
  }
  return null;
}

export type DocumentoPlano = { id: string; nombre: string; datos: Record<string, unknown> };

function documentoPlano(documento: { name?: string; fields?: Record<string, ValorFirestore> }): DocumentoPlano {
  const nombre = documento.name ?? '';
  return {
    id: nombre.slice(nombre.lastIndexOf('/') + 1),
    nombre,
    datos: Object.fromEntries(Object.entries(documento.fields ?? {}).map(([k, v]) => [k, aPlano(v)])),
  };
}

/**
 * Documentos de una colección de primer nivel con filtros de igualdad.
 *
 * Solo igualdades y ordenado por nombre del documento: con eso bastan los
 * índices de campo único que Firestore crea solo, y no hay que declarar ningún
 * índice compuesto en el proyecto de otra aplicación. La página siguiente se
 * pide con `despuesDe` (el `nombre` del último documento).
 */
export async function consultarColeccion(
  coleccion: 'institution_links' | 'link_requests',
  igualdades: Record<string, string | boolean>,
  opciones: { limite?: number; despuesDe?: string | null } = {},
): Promise<{ ok: true; documentos: DocumentoPlano[] } | { ok: false }> {
  if (!configurado()) {
    avisarUnaVez();
    return { ok: false };
  }
  const token = await accessToken();
  if (!token) return { ok: false };

  const filtros = Object.entries(igualdades).map(([campo, valor]) => ({
    fieldFilter: { field: { fieldPath: campo }, op: 'EQUAL', value: aValor(valor) },
  }));
  const consulta: Record<string, unknown> = {
    from: [{ collectionId: coleccion }],
    orderBy: [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }],
    limit: Math.min(Math.max(opciones.limite ?? 50, 1), 200),
  };
  if (filtros.length === 1) consulta.where = filtros[0];
  if (filtros.length > 1) consulta.where = { compositeFilter: { op: 'AND', filters: filtros } };
  if (opciones.despuesDe) {
    consulta.startAt = { values: [{ referenceValue: opciones.despuesDe }], before: false };
  }

  try {
    const respuesta = await fetch(`${urlBase()}:runQuery`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ structuredQuery: consulta }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!respuesta.ok) {
      console.warn(
        `[uniplanner] no se pudo consultar ${coleccion} (${respuesta.status}): ` +
          (await respuesta.text().catch(() => '')).slice(0, 200),
      );
      return { ok: false };
    }
    const filas = (await respuesta.json()) as {
      document?: { name?: string; fields?: Record<string, ValorFirestore> };
    }[];
    return { ok: true, documentos: filas.flatMap((f) => (f.document ? [documentoPlano(f.document)] : [])) };
  } catch (err) {
    console.warn('[uniplanner] fallo de red consultando:', err instanceof Error ? err.message : err);
    return { ok: false };
  }
}

/** Un documento por su ruta, o `null` si no existe (o no se pudo leer). */
export async function leerDocumento(
  ruta: string,
): Promise<{ ok: true; documento: DocumentoPlano | null } | { ok: false }> {
  if (!configurado()) {
    avisarUnaVez();
    return { ok: false };
  }
  const token = await accessToken();
  if (!token) return { ok: false };
  try {
    const respuesta = await fetch(`${urlBase()}/${ruta}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (respuesta.status === 404) return { ok: true, documento: null };
    if (!respuesta.ok) return { ok: false };
    return { ok: true, documento: documentoPlano((await respuesta.json()) as { name?: string; fields?: Record<string, ValorFirestore> }) };
  } catch {
    return { ok: false };
  }
}

/** Borra un documento. `true` también si ya no existía: el objetivo es que no esté. */
export async function borrarDocumento(ruta: string): Promise<boolean> {
  if (!configurado()) {
    avisarUnaVez();
    return false;
  }
  const token = await accessToken();
  if (!token) return false;
  try {
    const respuesta = await fetch(`${urlBase()}/${ruta}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    });
    return respuesta.ok || respuesta.status === 404;
  } catch {
    return false;
  }
}

/** Quita el bloqueo del semestre: el estudiante vuelve a poder cambiar su enlace. */
/**
 * Quita el bloqueo del semestre. **Borra** el campo en vez de dejarlo en
 * `null`: las reglas de UniPlanner comparan `lockedUntil <= request.time`, y
 * con `null` esa comparación falla y deniega, así que el enlace quedaba
 * imborrable para siempre justo cuando la institución lo había liberado.
 */
export async function desbloquearEnlace(linkId: string): Promise<boolean> {
  return escribirCampos(`${COLECCION_ENLACES}/${linkId}`, { [CAMPO_BLOQUEO]: undefined }, { soloSiExiste: true });
}

/**
 * Asigna un enlace a otra cuenta —la que la institución comprobó que es la
 * dueña del documento—, ya verificado y sin bloqueo.
 *
 * Se reescribe en vez de borrar para que no haya carrera: borrado, la cuenta
 * anterior podía reclamarlo otra vez antes que su dueño. Escrito con la cuenta
 * del dueño, las reglas de UniPlanner solo dejan tocarlo a él, y al volver a
 * enlazarse desde su app el lote actualiza este documento en vez de crearlo.
 */
export async function asignarEnlace(linkId: string, uid: string): Promise<boolean> {
  return escribirCampos(
    `${COLECCION_ENLACES}/${linkId}`,
    { uid, verified: true, verifiedAt: new Date(), [CAMPO_BLOQUEO]: undefined },
    { soloSiExiste: true },
  );
}

/** Libera un documento: borra el enlace, sea de quien sea. */
export async function liberarEnlace(linkId: string): Promise<boolean> {
  return borrarDocumento(`${COLECCION_ENLACES}/${linkId}`);
}

/** Contesta la solicitud de un estudiante, que la ve en su app. */
export async function resolverSolicitudEnlace(
  uid: string,
  resolucion: { status: 'approved' | 'rejected'; action: string; message: string },
): Promise<boolean> {
  return escribirCampos(
    `${COLECCION_SOLICITUDES}/${encodeURIComponent(uid)}`,
    { ...resolucion, resolvedAt: new Date() },
    { soloSiExiste: true },
  );
}

/** Para las pruebas: olvida el token cacheado. */
export function _reiniciarTokenParaPruebas(): void {
  tokenCache = null;
  tokenEnVuelo = null;
}
