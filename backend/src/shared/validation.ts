import { z } from 'zod';

/**
 * Campos de texto acotados, en un solo sitio.
 *
 * Todo `z.string()` sin `.max()` es una puerta abierta: Express acepta hasta
 * 2 MB de cuerpo, así que un solo campo podía llegar con dos millones de
 * caracteres. No hace falta mala intención para que duela —un copiar y pegar
 * desmedido basta— y el daño no es el rechazo, es que **se guarda**: a partir
 * de ahí ese documento viaja en cada listado, cada informe y cada respuesta
 * que lo incluya.
 *
 * Los topes viven aquí y no repartidos por los módulos para que sean los
 * mismos en todas partes y para que cambiarlos sea una decisión, no un
 * hallazgo. Los nombres describen el papel del campo, no su longitud: quien
 * escriba una ruta nueva elige `nombre` o `parrafo` sin tener que acordarse de
 * cuántos caracteres tocaban.
 */

/** Identificador corto: cédula, código de materia, código de empleado. */
export const codigo = z.string().trim().min(1).max(40);

/** Nombre propio, de materia o de grupo. */
export const nombre = z.string().trim().min(1).max(120);

/** Correo electrónico. El tope es el máximo real de una dirección (RFC 5321). */
export const correo = z.string().trim().toLowerCase().email().max(254);

/** Una línea: programa, aula, etiqueta, título. */
export const linea = z.string().trim().max(200);

/** Nota o comentario breve. */
export const nota = z.string().trim().max(500);

/** Texto libre largo: descripción de actividad, cuerpo de un aviso. */
export const parrafo = z.string().trim().max(4000);

/** URL guardada en base de datos (foto, adjunto). */
export const url = z.string().trim().url().max(500);

/**
 * Tope de elementos en una escritura por lotes.
 *
 * Un `z.array(...).min(1)` sin techo deja que el tamaño del lote lo decida el
 * límite del cuerpo HTTP, que no tiene ninguna relación con lo que la ruta
 * puede escribir sin bloquearse. 500 es holgado para cualquier grupo real
 * —el mayor de la institución no llega— y acota el trabajo por petición.
 */
export const TOPE_LOTE = 500;

// ── Paginación ──────────────────────────────────────────────────────────────

/**
 * Parámetros de página, comunes a todos los listados.
 *
 * Los listados ya traían un tope duro (`.limit(1000)`), y eso es peor que no
 * tenerlo: **truncaba en silencio**. El cliente recibía mil notas de tres mil,
 * pintaba "1000 registros" y nadie podía saber que faltaban dos mil. Un tope
 * sin forma de pedir el resto ni de enterarse de que hay resto es una pérdida
 * de datos con buena presentación.
 *
 * Ahora el tope sigue existiendo —nadie descarga el padrón de una vez— pero
 * viene acompañado de `total` y `hasMore`, así que la interfaz puede decir la
 * verdad y pedir la página siguiente.
 */
/**
 * Techo absoluto por petición, sea cual sea lo que pida el cliente.
 *
 * Dos mil filas son unos pocos megabytes de JSON; más que eso no cabe en la
 * pantalla de nadie y sí tumba el teléfono que lo recibe.
 */
export const TOPE_PAGINA = 2000;

/**
 * Esquema de paginación con el tope por defecto de cada listado.
 *
 * **El valor por defecto es el que ese endpoint ya devolvía.** No es
 * casualidad: bajar el defecto a cien habría dejado a los clientes publicados
 * —el móvil de cada docente, que no se actualiza el mismo día— pidiendo la
 * lista de siempre y recibiendo la décima parte, sin ningún error. La toma de
 * asistencia habría perdido a la mitad del salón y nadie habría sabido por
 * qué. La paginación se pide; no se impone.
 */
export function paginacionCon(porDefecto: number) {
  return z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(TOPE_PAGINA).default(porDefecto),
  });
}

/** Paginación de un listado que se navega a mano. */
export const paginacion = paginacionCon(100);

export type Paginacion = { page: number; limit: number };

/** Traduce la página a los parámetros que entiende Mongo. */
export function saltoYTope({ page, limit }: Paginacion): { skip: number; limit: number } {
  return { skip: (page - 1) * limit, limit };
}

/**
 * Envoltorio de respuesta paginada.
 *
 * `items` se queda donde estaba, en la raíz: los clientes que ya leían
 * `data.items` siguen funcionando sin tocar nada, y los que quieran paginar
 * miran los campos nuevos. Cambiar la forma de la respuesta habría obligado a
 * publicar los tres clientes a la vez, y un móvil desactualizado se habría
 * quedado con la pantalla en blanco.
 */
export function respuestaPaginada<T>(items: T[], total: number, pagina: Paginacion) {
  return {
    ok: true as const,
    items,
    total,
    page: pagina.page,
    limit: pagina.limit,
    hasMore: pagina.page * pagina.limit < total,
  };
}
