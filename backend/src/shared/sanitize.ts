/**
 * Saneado central de todo lo que se guarda para ser leído después por una
 * persona: auditoría y telemetría de errores.
 *
 * Vive en un solo sitio y no repartido por cada escritura porque la regla que
 * protege es negativa —«esto NO puede quedar guardado»— y una regla negativa
 * copiada en ocho ficheros se cumple en siete. La escritura nueva que alguien
 * añada dentro de un año pasa por `auditChange`/`auditBatch` y por el módulo
 * de telemetría; si el saneado vive ahí dentro, no hay forma de saltárselo sin
 * querer.
 *
 * Lo que se elimina no es una lista de sospechas: es lo que de hecho viaja en
 * los cuerpos de este sistema. La contraseña de `/auth/register`, el código de
 * `/recovery/confirm`, el token de refresco, la cabecera `Authorization` de un
 * error de red del cliente. Cualquiera de esos guardado en `auditoria` es una
 * toma de cuenta esperando a que alguien lea la colección.
 */

/**
 * Claves cuyo VALOR nunca se guarda, se llamen como se llamen dentro del
 * objeto. La comparación es sobre el nombre en minúsculas y sin separadores,
 * así que `refresh_token`, `refreshToken` y `REFRESH-TOKEN` caen los tres.
 */
const CLAVES_PROHIBIDAS = [
  'password',
  'passwordhash',
  'newpassword',
  'currentpassword',
  'contrasena',
  'contrasenia',
  'token',
  'accesstoken',
  'refreshtoken',
  'authorization',
  'cookie',
  'setcookie',
  'secret',
  'jwtaccesssecret',
  'jwtrefreshsecret',
  'apikey',
  'privatekey',
  'fcmprivatekey',
  'smtppass',
  'mongodburi',
  'recoverycode',
  'devcode',
  'code2fa',
  'otp',
];

/** Normaliza un nombre de campo para compararlo con la lista de arriba. */
function normalizarClave(clave: string): string {
  return clave.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function esClaveProhibida(clave: string): boolean {
  const normal = normalizarClave(clave);
  return CLAVES_PROHIBIDAS.some(prohibida => normal === prohibida || normal.includes(prohibida));
}

/** Marca lo eliminado en vez de borrarlo en silencio: quien lea sabe que había algo. */
export const OCULTO = '[oculto]';

/** Topes de tamaño. Un `before`/`after` no es una copia de seguridad. */
export const LIMITES = {
  /** Caracteres por valor de texto dentro de un objeto auditado. */
  TEXTO: 500,
  /** Elementos por arreglo. */
  ARREGLO: 50,
  /** Claves por objeto. */
  CLAVES: 60,
  /** Profundidad de anidamiento. */
  PROFUNDIDAD: 5,
  /** Caracteres del JSON serializado completo. */
  TOTAL: 8000,
  /** Mensaje de error de un cliente. */
  MENSAJE: 400,
  /** Contexto técnico (pila) de un error de cliente. */
  CONTEXTO: 2000,
} as const;

/**
 * Patrones de datos personales que no deberían viajar en un mensaje de error
 * ni en una traza. Se enmascaran aunque estén dentro de una cadena libre, que
 * es justo donde se cuelan: «Error al guardar 1098765432».
 */
const PATRONES = [
  // Correo electrónico.
  { re: /[\w.+-]+@[\w-]+\.[\w.-]+/g, por: '[correo]' },
  // Bearer / JWT: tres bloques base64url separados por puntos.
  { re: /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, por: '[token]' },
  // Cadena de conexión con credenciales.
  { re: /\b(mongodb(?:\+srv)?|postgres|mysql|redis):\/\/[^\s"']+/gi, por: '[conexion]' },
  // Cédula colombiana: 6 a 12 dígitos seguidos.
  { re: /\b\d{6,12}\b/g, por: '[id]' },
];

/**
 * Enmascara datos personales dentro de una cadena y la acota.
 *
 * El orden importa: la cédula va la última porque su patrón (dígitos sueltos)
 * también casa con trozos de un token, y aplicarla antes destruiría la pista
 * de que lo que había era un token.
 */
export function sanearTexto(valor: string, tope: number = LIMITES.TEXTO): string {
  let salida = valor;
  for (const patron of PATRONES) salida = salida.replace(patron.re, patron.por);
  return salida.length > tope ? `${salida.slice(0, tope)}…[recortado]` : salida;
}

/**
 * Saneado recursivo de un valor arbitrario.
 *
 * Devuelve una estructura nueva; nunca modifica la original, porque lo que se
 * audita suele ser el documento que la petición sigue usando.
 */
export function sanearValor(valor: unknown, profundidad = 0): unknown {
  if (valor === null || valor === undefined) return null;

  if (profundidad > LIMITES.PROFUNDIDAD) return '[profundidad excedida]';

  const tipo = typeof valor;
  if (tipo === 'string') return sanearTexto(valor as string);
  if (tipo === 'number' || tipo === 'boolean') return valor;
  if (tipo === 'function' || tipo === 'symbol') return null;
  if (valor instanceof Date) return valor.toISOString();

  // Un Buffer o un stream son cuerpos binarios: nunca se registran.
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(valor)) return '[binario]';

  if (Array.isArray(valor)) {
    const recortado = valor.slice(0, LIMITES.ARREGLO).map(item => sanearValor(item, profundidad + 1));
    if (valor.length > LIMITES.ARREGLO) recortado.push(`[+${valor.length - LIMITES.ARREGLO} más]`);
    return recortado;
  }

  if (tipo === 'object') {
    // ObjectId, Decimal128 y demás tipos de BSON: su texto es la identidad.
    const objeto = valor as Record<string, unknown>;
    if (typeof objeto.toHexString === 'function') return String(objeto);

    const salida: Record<string, unknown> = {};
    let claves = 0;
    for (const [clave, contenido] of Object.entries(objeto)) {
      if (claves >= LIMITES.CLAVES) {
        salida['…'] = '[claves omitidas]';
        break;
      }
      claves += 1;
      salida[clave] = esClaveProhibida(clave) ? OCULTO : sanearValor(contenido, profundidad + 1);
    }
    return salida;
  }

  return null;
}

/**
 * Punto de entrada para `before`/`after` de auditoría.
 *
 * Además del saneado por campo, aplica un tope al total serializado: un
 * documento con cien campos cortos pasa cada tope individual y aun así ocupa
 * más de lo que un registro de auditoría debería. Cuando no cabe, se conserva
 * un resumen con las claves en vez del contenido: quien investigue sigue
 * sabiendo **qué** cambió aunque no vea todo el valor.
 */
export function sanearParaAuditoria(valor: unknown): unknown {
  const saneado = sanearValor(valor);
  if (saneado === null) return null;

  let serializado: string;
  try {
    serializado = JSON.stringify(saneado);
  } catch {
    return '[no serializable]';
  }

  if (serializado.length <= LIMITES.TOTAL) return saneado;

  if (saneado && typeof saneado === 'object' && !Array.isArray(saneado)) {
    return {
      __resumen: 'documento demasiado grande para auditar completo',
      __claves: Object.keys(saneado as Record<string, unknown>).slice(0, LIMITES.CLAVES),
      __bytes: serializado.length,
    };
  }
  return `[recortado: ${serializado.length} bytes]`;
}

/**
 * Diferencia entre dos versiones de un documento.
 *
 * Guardar el documento entero dos veces por cada cambio de un campo llena la
 * colección de copias casi idénticas: un `PATCH` de una nota escribía dos
 * expedientes completos para registrar que un número pasó de 3.0 a 3.5. El
 * diff registra lo que cambió, que es la única pregunta que un panel de
 * auditoría responde.
 *
 * Devuelve `null` cuando no hay cambios, para que quien audite pueda decidir
 * si vale la pena escribir.
 */
export function calcularDiff(
  antes: Record<string, unknown> | null | undefined,
  despues: Record<string, unknown> | null | undefined,
): { before: Record<string, unknown>; after: Record<string, unknown> } | null {
  if (!antes || !despues) return null;

  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  const claves = new Set([...Object.keys(antes), ...Object.keys(despues)]);

  for (const clave of claves) {
    // Las marcas de tiempo cambian en cada escritura y no informan de nada.
    if (clave === 'updatedAt' || clave === '__v') continue;
    const a = antes[clave];
    const b = despues[clave];
    if (JSON.stringify(a ?? null) === JSON.stringify(b ?? null)) continue;
    before[clave] = esClaveProhibida(clave) ? OCULTO : sanearValor(a);
    after[clave] = esClaveProhibida(clave) ? OCULTO : sanearValor(b);
  }

  return Object.keys(after).length === 0 ? null : { before, after };
}

/**
 * Resume un error para mostrarlo en el centro de salud.
 *
 * Un `Error` de Mongoose o de `fetch` lleva dentro la URI de conexión con
 * usuario y contraseña, y el centro de salud es exactamente la pantalla donde
 * apetece pegar el mensaje entero. Se queda con la primera línea, saneada.
 */
export function resumirError(causa: unknown, tope = 200): string {
  const bruto =
    causa instanceof Error
      ? causa.message
      : typeof causa === 'string'
        ? causa
        : (() => {
            try {
              return JSON.stringify(causa);
            } catch {
              return 'error desconocido';
            }
          })();
  return sanearTexto(String(bruto).split('\n')[0] ?? '', tope);
}
