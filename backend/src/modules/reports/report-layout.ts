/**
 * Maquetación de los documentos exportados: paleta, medidas y las cuentas que
 * deciden cómo cabe una tabla en la página.
 *
 * Pura —sin pdfkit, sin exceljs, sin base— para poder probarla. Los dos
 * renderers dibujan con lo que sale de aquí, así que el PDF y el Excel no
 * pueden acabar con dos criterios distintos sobre qué es un color de alerta o
 * cómo se escribe una fecha.
 *
 * Los colores son **contenido del documento**, como el membrete de un acta en
 * papel, no interfaz: por eso no pasan por los tokens del design system. Sí
 * salen de la misma paleta (`DESIGN.md` §4), y los de texto están elegidos para
 * leerse impresos en blanco y negro.
 */

/** Tintas fijas del documento. Lo configurable está en la plantilla. */
export const TINTA = {
  texto: '#16202B',
  secundario: '#5D6B7A',
  borde: '#E3E8EE',
  panel: '#F3F5F8',
  cebra: '#F7F9FB',
  /** Lima UTS: filetes y marcas, nunca texto. */
  acento: '#CAD225',
  blanco: '#FFFFFF',
  /** Estados: versiones oscuras de los semánticos, legibles sobre blanco (≥ 5:1). */
  ok: '#15803D',
  alerta: '#B45309',
  mal: '#B91C1C',
} as const;

/** Significado de una celda o de un indicador; el color lo pone el renderer. */
export type Tono = 'ok' | 'alerta' | 'mal';

export function colorDeTono(tono: Tono | null | undefined): string {
  if (tono === 'ok') return TINTA.ok;
  if (tono === 'alerta') return TINTA.alerta;
  if (tono === 'mal') return TINTA.mal;
  return TINTA.texto;
}

// ── Contraste ───────────────────────────────────────────────────────────────

function luminancia(hex: string): number {
  const limpio = hex.replace('#', '');
  const canal = (inicio: number) => {
    const valor = parseInt(limpio.slice(inicio, inicio + 2), 16) / 255;
    return valor <= 0.03928 ? valor / 12.92 : ((valor + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(0) + 0.7152 * canal(2) + 0.0722 * canal(4);
}

export function contraste(a: string, b: string): number {
  const [claro, oscuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (claro + 0.05) / (oscuro + 0.05);
}

/**
 * Color del texto que va sobre un fondo de la plantilla.
 *
 * El fondo lo elige la administración, y antes el texto del encabezado era
 * siempre oscuro: un verde institucional dejaba los títulos de columna negros
 * sobre verde oscuro. Se queda con el que más contraste dé.
 */
export function textoSobre(fondo: string): string {
  return contraste(fondo, TINTA.blanco) >= contraste(fondo, TINTA.texto) ? TINTA.blanco : TINTA.texto;
}

/**
 * Color de marca usable como **texto** sobre blanco.
 *
 * El membrete pinta el título con el color de marca. Si la administración
 * elige uno claro —una lima, un pastel— el título se volvería ilegible; por
 * debajo de AA se cae a la tinta de texto.
 */
export function marcaComoTexto(marca: string): string {
  return contraste(marca, TINTA.blanco) >= 4.5 ? marca : TINTA.texto;
}

// ── Página ──────────────────────────────────────────────────────────────────

export type Orientacion = 'portrait' | 'landscape';

/** A4 en puntos tipográficos. */
export const A4 = { corto: 595.28, largo: 841.89 } as const;

export const MARGEN = {
  x: 36,
  superior: 36,
  /** Deja sitio al pie con la paginación. */
  inferior: 54,
} as const;

export function anchoUtil(orientacion: Orientacion): number {
  return (orientacion === 'landscape' ? A4.largo : A4.corto) - MARGEN.x * 2;
}

/**
 * Orientación de un documento según sus tablas.
 *
 * Los anchos del catálogo son los **naturales**: los que necesita cada columna
 * para que una cédula de diez dígitos o un nombre de cuatro palabras quepan sin
 * partirse. En vertical caben 523 pt; si alguna tabla pide más, el documento
 * va en horizontal. Antes todo iba en vertical y las columnas se estrechaban a
 * la fuerza, que es de donde salían los nombres y las cédulas cortados.
 */
export function orientacionPara(tablas: number[][]): Orientacion {
  const masAncha = Math.max(0, ...tablas.map(anchos => anchos.reduce((suma, a) => suma + a, 0)));
  return masAncha > anchoUtil('portrait') ? 'landscape' : 'portrait';
}

/**
 * Reparte el ancho disponible entre las columnas, en proporción a su ancho
 * natural. La tabla ocupa siempre la caja entera: ni se sale del margen ni
 * deja un hueco a la derecha cuando la plantilla oculta columnas.
 */
export function ajustarAnchos(anchos: number[], disponible: number): number[] {
  if (!anchos.length) return [];
  const total = anchos.reduce((suma, a) => suma + Math.max(0, a), 0);
  const base = total > 0 ? anchos.map(a => Math.max(0, a)) : anchos.map(() => 1);
  const suma = total > 0 ? total : anchos.length;

  const escalados = base.map(a => Math.floor((a / suma) * disponible * 100) / 100);
  const resto = disponible - escalados.reduce((s, a) => s + a, 0);
  // El redondeo sobrante va a la columna más ancha, donde no se nota.
  const indice = escalados.indexOf(Math.max(...escalados));
  return escalados.map((a, i) => (i === indice ? Math.round((a + resto) * 100) / 100 : a));
}

/**
 * Anchos de columna según lo que contienen, como el reparto automático de una
 * tabla HTML.
 *
 * El renderer mide dos cosas por columna: el **mínimo** —la palabra más larga
 * del encabezado o de las celdas, que no se puede partir sin romperla
 * («SEMESTR / E», «2026-09-0 / 8»)— y el **preferido** —el texto completo más
 * largo, para que quepa en una línea—. Con proporciones fijas, un grupo de
 * nombres cortos dejaba media columna vacía mientras la materia de al lado se
 * partía en dos líneas.
 *
 * - Si los preferidos caben, cada columna recibe el suyo y el sobrante se
 *   reparte en proporción.
 * - Si no, cada una recibe su mínimo y lo que queda se reparte según lo que le
 *   falta para su preferido: crece más la que más texto tiene que partir.
 * - Si ni los mínimos caben, se reparten ellos y pdfkit parte lo que no quepa:
 *   mejor eso que salirse del margen.
 */
export function repartirAnchos(preferidos: number[], minimos: number[], disponible: number): number[] {
  const piso = preferidos.map((_, i) => Math.max(0, minimos[i] ?? 0));
  const ideal = preferidos.map((p, i) => Math.max(p, piso[i]));
  const sumaIdeal = ideal.reduce((s, p) => s + p, 0);
  const sumaPiso = piso.reduce((s, m) => s + m, 0);

  if (sumaIdeal <= disponible) return ajustarAnchos(ideal, disponible);
  if (sumaPiso >= disponible) return ajustarAnchos(piso, disponible);

  const faltas = ideal.map((p, i) => p - piso[i]);
  const sumaFaltas = faltas.reduce((s, f) => s + f, 0);
  const repartible = disponible - sumaPiso;
  // Mismo cuadre final que `ajustarAnchos`: la tabla ocupa la caja exacta.
  return ajustarAnchos(piso.map((m, i) => m + (faltas[i] / sumaFaltas) * repartible), disponible);
}

// ── Fechas ──────────────────────────────────────────────────────────────────

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/**
 * Momento de generación en la hora del campus: «27 sep 2026, 15:42».
 *
 * Con la hora del servidor un acta generada a las 8 p. m. en Bucaramanga
 * saldría fechada al día siguiente si el servidor corre en UTC.
 */
export function fechaHoraDeCampus(instante: Date, offsetMinutos: number): string {
  const local = new Date(instante.getTime() + offsetMinutos * 60_000);
  const dia = local.getUTCDate();
  const mes = MESES[local.getUTCMonth()];
  const hora = String(local.getUTCHours()).padStart(2, '0');
  const minutos = String(local.getUTCMinutes()).padStart(2, '0');
  return `${dia} ${mes} ${local.getUTCFullYear()}, ${hora}:${minutos}`;
}

/**
 * Día de un filtro (`dateFrom`/`dateTo`) como `dd/mm/aaaa`.
 *
 * Se lee en UTC a propósito: la URL trae `2026-09-01`, que `new Date()` toma
 * como medianoche UTC; pasarlo a la zona del campus lo pintaría como el 31 de
 * agosto.
 */
export function fechaCorta(valor: unknown): string {
  if (valor == null || valor === '') return '';
  const fecha = new Date(valor as string | number | Date);
  if (Number.isNaN(fecha.getTime())) return '';
  const [anio, mes, dia] = fecha.toISOString().slice(0, 10).split('-');
  return `${dia}/${mes}/${anio}`;
}

// ── Excel ───────────────────────────────────────────────────────────────────

/**
 * Ancho de una columna de Excel a partir de lo que contiene.
 *
 * Los anchos fijos cortaban a la vista cualquier nombre largo: Excel solo
 * desborda una celda sobre la de al lado si esa está vacía, y en una tabla
 * nunca lo está. Por encima del máximo la celda ajusta el texto en varias
 * líneas en vez de ensanchar la hoja hasta lo imprimible.
 */
export function anchoExcel(textos: string[], minimo: number, maximo = 60): number {
  const masLargo = Math.max(0, ...textos.flatMap(texto => String(texto).split('\n').map(linea => linea.length)));
  return Math.min(maximo, Math.max(minimo, masLargo + 2));
}

/**
 * Alto de una fila de Excel con texto ajustado en celdas combinadas.
 *
 * Excel no agranda solo una fila combinada con `wrapText`: lo que no cabe en
 * el alto fijado queda oculto hasta que alguien estira la fila a mano. La ficha
 * de un reporte con materia, grupo, estudiante y rango ocupa tres líneas; con
 * un alto elegido a ojo, justo el dato de qué acta es esta se cortaba.
 *
 * Estimación conservadora: un carácter de ancho de columna es un carácter a
 * 10 pt, con un 10 % de margen para la negrita; más grande, caben menos.
 */
export function altoDeFilaExcel(texto: string, anchoEnCaracteres: number, tamano: number): number {
  const porLinea = Math.max(1, Math.floor(anchoEnCaracteres * (10 / tamano) * 0.9));
  const lineas = texto
    .split('\n')
    .reduce((suma, linea) => suma + Math.max(1, Math.ceil(linea.length / porLinea)), 0);
  return Math.ceil(lineas * tamano * 1.35 + 4);
}

/**
 * Formato de un logo por su firma, no por la extensión. pdfkit solo lee PNG y
 * JPEG, y ExcelJS solo PNG, JPEG y GIF: un WebP subido a la plantilla no puede
 * tumbar el acta, así que lo que no se reconoce se descarta.
 */
export function formatoDeImagen(bytes: Uint8Array): 'png' | 'jpeg' | null {
  if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return 'png';
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  return null;
}

/**
 * Ancho y alto de un PNG o un JPEG leyendo su cabecera. ExcelJS coloca una
 * imagen con medidas explícitas y no las deduce: sin esto un logo apaisado
 * salía estirado a un cuadrado.
 */
export function dimensionesDeImagen(bytes: Uint8Array): { ancho: number; alto: number } | null {
  const formato = formatoDeImagen(bytes);
  const leer16 = (i: number) => (bytes[i] << 8) | bytes[i + 1];
  if (formato === 'png' && bytes.length >= 24) {
    const leer32 = (i: number) => ((bytes[i] << 24) | (bytes[i + 1] << 16) | (bytes[i + 2] << 8) | bytes[i + 3]) >>> 0;
    return { ancho: leer32(16), alto: leer32(20) };
  }
  if (formato === 'jpeg') {
    // Se recorren los segmentos hasta un SOF (C0–CF salvo C4, C8 y CC, que no lo son).
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) return null;
      const marcador = bytes[i + 1];
      const esSof = marcador >= 0xc0 && marcador <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marcador);
      if (esSof) return { ancho: leer16(i + 7), alto: leer16(i + 5) };
      i += 2 + leer16(i + 2);
    }
  }
  return null;
}
