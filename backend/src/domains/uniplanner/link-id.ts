/**
 * Identidad del enlace con UniPlanner. Lógica pura, sin I/O.
 *
 * UniPlanner guarda la vinculación de cada estudiante en un documento cuyo
 * **nombre se deriva de (institución, código)**: `uts__1098765432`. Esa es la
 * decisión que permite que Nexus traduzca una matrícula a una cuenta con una
 * lectura directa, sin consulta y sin servicio puente de por medio.
 *
 * El precio es que **este archivo tiene que normalizar exactamente igual que
 * UniPlanner**. Si no, el enlace existe, es válido, y Nexus lo busca con otro
 * nombre: no llega ni un aviso y no hay ningún error por el que enterarse. El
 * original está en `UniPlanner/lib/features/institucional/domain/entities/
 * institution_link_entity.dart`, y las pruebas de aquí repiten sus casos.
 */

/** Lo que cabe en un código de estudiante. Igual que en UniPlanner. */
export const MAX_CODIGO = 32;
/**
 * Tope de la clave de institución.
 *
 * Es el mismo `LIMITES.ID_MAX` con el que el panel genera el slug de un perfil
 * institucional. No es una coincidencia que haya que mantener: si este fuera
 * más corto, las universidades con la clave más larga no podrían enlazarse y
 * no habría forma de saberlo desde ninguno de los dos lados.
 */
export const MAX_INSTITUCION = 40;

/**
 * El código tal y como se guarda: sin espacios, sin puntos ni guiones y en
 * mayúsculas.
 *
 * `1.098.765.432` y `1098765432` son la misma matrícula escrita de dos
 * maneras, y el código forma parte del nombre del documento.
 *
 * Devuelve cadena vacía si no queda nada aprovechable.
 */
export function normalizarCodigo(bruto: string): string {
  const limpio = String(bruto ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  return limpio.length <= MAX_CODIGO ? limpio : limpio.slice(0, MAX_CODIGO);
}

/** Si un código sirve para enlazar. Un solo carácter no identifica a nadie. */
export function esCodigoValido(bruto: string): boolean {
  const codigo = normalizarCodigo(bruto);
  return codigo.length >= 4 && codigo.length <= MAX_CODIGO;
}

/**
 * Si una clave de institución tiene la forma que UniPlanner acepta.
 *
 * Admite guion además de guion bajo porque `generarInstitutionId()` emite
 * `unab-2` cuando dos universidades comparten sigla, y esa clave es inmutable.
 * `tests/uniplanner-message.test.ts` comprueba que todo lo que genera el panel
 * pasa por aquí — que es la comprobación que faltaba cuando los dos patrones
 * eran incompatibles.
 */
export function esInstitucionValida(bruto: string): boolean {
  const valor = String(bruto ?? '');
  if (!valor || valor.length > MAX_INSTITUCION) return false;
  return /^[a-z0-9_-]+$/.test(valor);
}

/**
 * Nombre del documento de enlace, o `null` si los datos no dan para uno.
 *
 * El separador es **doble** a propósito: un id de institución puede llevar
 * guión bajo simple (`uts_bucaramanga`), así que con uno solo
 * `uts_bucaramanga` + `123` y `uts` + `bucaramanga_123` darían el mismo
 * documento — dos matrículas distintas compartiendo buzón.
 */
export function idDeEnlace(institucion: string, codigo: string): string | null {
  if (!esInstitucionValida(institucion)) return null;
  if (!esCodigoValido(codigo)) return null;
  return `${institucion}__${normalizarCodigo(codigo)}`;
}
