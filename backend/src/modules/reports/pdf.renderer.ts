import path from 'node:path';
import fs from 'node:fs';
import PDFDocument from 'pdfkit';
import type { ColumnaReporte } from './report-columns.js';
import { logoDelDocumento, type Plantilla } from './report-template.js';
import {
  A4,
  MARGEN,
  TINTA,
  anchoUtil,
  colorDeTono,
  marcaComoTexto,
  repartirAnchos,
  textoSobre,
  type Orientacion,
} from './report-layout.js';
import type { Dato, Indicador } from './report-summary.js';

/**
 * Dibujo de los PDF.
 *
 * Todo lo que sabe de pdfkit vive aquí y en ningún otro sitio. Estos PDF son
 * actas que el docente imprime, firma y entrega, así que las decisiones de aquí
 * no son cosméticas:
 *
 * - **Nada se corta.** Las celdas ajustan el texto en varias líneas y la fila
 *   crece con la más alta. Antes cada fila medía 20 pt fijos con `ellipsis`, y
 *   un nombre de cuatro palabras o una cédula de diez dígitos salían truncados
 *   sin que el acta lo delatara.
 * - **La página se elige por la tabla** (`orientacionPara`): lo que no cabe en
 *   vertical va en horizontal, y los anchos reparten la caja entera.
 * - **Cada página se identifica sola**: membrete en la primera, cabecera
 *   corrida en las demás, encabezado de tabla repetido y «Página N de M».
 * - La tipografía es Inter, la de las aplicaciones, empaquetada en
 *   `assets/fonts`. Si falta, se cae a Helvetica en vez de no generar el acta.
 */

type Doc = PDFKit.PDFDocument;

type Fuentes = {
  normal: string;
  media: string;
  negrita: string;
  /** Cifras de ancho fijo (tnum): las columnas de notas se alinean por el punto. Solo Inter lo tiene. */
  cifras: PDFKit.Mixins.OpenTypeFeatures[];
};

const HELVETICA: Fuentes = { normal: 'Helvetica', media: 'Helvetica-Bold', negrita: 'Helvetica-Bold', cifras: [] };

const ARCHIVOS_INTER: Record<'normal' | 'media' | 'negrita', string> = {
  normal: 'Inter-Regular.ttf',
  media: 'Inter-SemiBold.ttf',
  negrita: 'Inter-Bold.ttf',
};

function registrarFuentes(doc: Doc): Fuentes {
  const carpeta = path.join(process.cwd(), 'assets', 'fonts');
  const rutas = Object.entries(ARCHIVOS_INTER).map(([clave, archivo]) => [clave, path.join(carpeta, archivo)] as const);
  if (!rutas.every(([, ruta]) => fs.existsSync(ruta))) return HELVETICA;
  try {
    for (const [clave, ruta] of rutas) doc.registerFont(`inter-${clave}`, ruta);
    return { normal: 'inter-normal', media: 'inter-media', negrita: 'inter-negrita', cifras: ['tnum'] };
  } catch {
    return HELVETICA;
  }
}

/** Un documento en curso: el `doc` de pdfkit y lo que hace falta para seguir dibujándolo. */
export type Informe = {
  doc: Doc;
  plantilla: Plantilla;
  titulo: string;
  generado: string;
  fuentes: Fuentes;
  ancho: number;
  alto: number;
  util: number;
  /** Y en la que se sigue dibujando. */
  y: number;
  /** Líneas de firma que cierran el acta. */
  firmas: string[];
};

export type OpcionesPdf = {
  titulo: string;
  archivo: string;
  plantilla: Plantilla;
  orientacion: Orientacion;
  /** Ficha del reporte: periodo, materia, grupo, fecha de generación. */
  detalles: Dato[];
  indicadores?: Indicador[];
  /** Fecha y hora de generación ya formateadas en la hora del campus. */
  generado: string;
  /** Líneas de firma al final del documento (docente, coordinación). */
  firmas?: string[];
};

type Respuesta = NodeJS.WritableStream & { setHeader(name: string, value: string): void };

/** Abre el documento, lo enchufa a la respuesta y dibuja el membrete y la ficha. */
export function iniciarPdf(res: Respuesta, opciones: OpcionesPdf): Informe {
  const doc = new PDFDocument({
    size: 'A4',
    layout: opciones.orientacion,
    margins: { top: MARGEN.superior, bottom: MARGEN.inferior, left: MARGEN.x, right: MARGEN.x },
    // Sin páginas en memoria no se puede escribir «de M» en el pie.
    bufferPages: true,
    info: {
      Title: opciones.titulo,
      Author: opciones.plantilla.institucion,
      Creator: 'UTS Nexus Académico',
    },
  });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${opciones.archivo}"`);
  doc.pipe(res);

  const horizontal = opciones.orientacion === 'landscape';
  const informe: Informe = {
    doc,
    plantilla: opciones.plantilla,
    titulo: opciones.titulo,
    generado: opciones.generado,
    fuentes: registrarFuentes(doc),
    ancho: horizontal ? A4.largo : A4.corto,
    alto: horizontal ? A4.corto : A4.largo,
    util: anchoUtil(opciones.orientacion),
    y: MARGEN.superior,
    firmas: opciones.firmas ?? [],
  };

  dibujarMembrete(informe);
  dibujarFicha(informe, opciones.detalles);
  if (opciones.indicadores?.length) dibujarIndicadores(informe, opciones.indicadores);
  return informe;
}

// ── Membrete y cabecera corrida ─────────────────────────────────────────────

function franjaDeMarca(informe: Informe, alto: number) {
  const { doc, plantilla, ancho } = informe;
  doc.rect(0, 0, ancho, alto).fill(plantilla.colores.marca);
  doc.rect(0, alto, ancho, alto / 3).fill(TINTA.acento);
}

function dibujarMembrete(informe: Informe) {
  const { doc, plantilla, fuentes, util } = informe;
  franjaDeMarca(informe, 6);

  const top = 24;
  const logo = logoDelDocumento(plantilla);
  let logoDibujado = false;
  if (logo) {
    try {
      doc.image(logo.ruta, MARGEN.x, top, { fit: [118, 58], valign: 'center' });
      logoDibujado = true;
    } catch {
      logoDibujado = false;
    }
  }
  if (!logoDibujado) {
    // Un logo corrupto no debe tumbar el acta: queda el recuadro con la sigla.
    doc.roundedRect(MARGEN.x, top, 58, 58, 10).fill(plantilla.colores.marca);
    doc
      .font(fuentes.negrita)
      .fontSize(18)
      .fillColor(textoSobre(plantilla.colores.marca))
      .text(plantilla.sigla, MARGEN.x, top + 20, { width: 58, align: 'center', lineBreak: false });
  }

  // "Universidad de Santander" es OTRA institución (UDES). Estos PDF son actas
  // que el docente entrega, así que el nombre tiene que ser el correcto.
  const bloque = util * 0.55;
  const xDerecha = MARGEN.x + util - bloque;
  doc
    .font(fuentes.negrita)
    .fontSize(10.5)
    .fillColor(TINTA.texto)
    .text(plantilla.institucion, xDerecha, top + 12, { width: bloque, align: 'right' });
  doc
    .font(fuentes.normal)
    .fontSize(8)
    .fillColor(TINTA.secundario)
    .text('Sistema académico UTS Nexus', xDerecha, doc.y + 2, { width: bloque, align: 'right' });

  let y = top + 58 + 16;
  doc
    .font(fuentes.negrita)
    .fontSize(17)
    .fillColor(marcaComoTexto(plantilla.colores.marca))
    .text(informe.titulo, MARGEN.x, y, { width: util });
  y = doc.y + 4;
  doc.rect(MARGEN.x, y, 40, 2.5).fill(TINTA.acento);
  informe.y = y + 12;
}

/** Cabecera de las páginas 2 en adelante: quien encuentra una hoja suelta sabe de qué acta es. */
function dibujarCabeceraCorrida(informe: Informe) {
  const { doc, plantilla, fuentes, util } = informe;
  franjaDeMarca(informe, 4);
  const y = 16;
  doc
    .font(fuentes.media)
    .fontSize(8.5)
    .fillColor(TINTA.texto)
    .text(informe.titulo, MARGEN.x, y, { width: util * 0.6, lineBreak: false, ellipsis: true });
  doc
    .font(fuentes.normal)
    .fontSize(8)
    .fillColor(TINTA.secundario)
    .text(plantilla.institucion, MARGEN.x + util * 0.4, y + 0.5, { width: util * 0.6, align: 'right', lineBreak: false, ellipsis: true });
  doc.moveTo(MARGEN.x, y + 16).lineTo(MARGEN.x + util, y + 16).lineWidth(0.6).strokeColor(TINTA.borde).stroke();
  informe.y = y + 26;
}

function nuevaPagina(informe: Informe) {
  informe.doc.addPage();
  dibujarCabeceraCorrida(informe);
}

/** Límite inferior útil de la página: debajo va el pie. */
const limite = (informe: Informe) => informe.alto - MARGEN.inferior;

function asegurarEspacio(informe: Informe, alto: number) {
  if (informe.y + alto > limite(informe)) nuevaPagina(informe);
}

// ── Ficha e indicadores ─────────────────────────────────────────────────────

function dibujarFicha(informe: Informe, datos: Dato[]) {
  if (!datos.length) return;
  const { doc, fuentes, util, plantilla } = informe;
  const porFila = util > 600 ? 4 : 3;
  const relleno = 10;
  const anchoCelda = (util - relleno * 2) / porFila;

  const filas: Dato[][] = [];
  for (let i = 0; i < datos.length; i += porFila) filas.push(datos.slice(i, i + porFila));

  doc.font(fuentes.media).fontSize(9);
  const altos = filas.map(fila =>
    Math.max(...fila.map(dato => doc.heightOfString(dato.valor, { width: anchoCelda - 12 }))) + 14,
  );
  const alto = altos.reduce((suma, a) => suma + a, 0) + relleno * 2 - 4;

  const y0 = informe.y;
  doc.roundedRect(MARGEN.x, y0, util, alto, 4).fillAndStroke(TINTA.panel, TINTA.borde);
  doc.rect(MARGEN.x, y0, 3, alto).fill(plantilla.colores.marca);

  let y = y0 + relleno;
  filas.forEach((fila, f) => {
    fila.forEach((dato, c) => {
      const x = MARGEN.x + relleno + c * anchoCelda;
      doc
        .font(fuentes.media)
        .fontSize(6.5)
        .fillColor(TINTA.secundario)
        .text(dato.etiqueta.toUpperCase(), x, y, { width: anchoCelda - 12, characterSpacing: 0.6, lineBreak: false });
      doc
        .font(fuentes.media)
        .fontSize(9)
        .fillColor(TINTA.texto)
        .text(dato.valor, x, y + 10, { width: anchoCelda - 12 });
    });
    y += altos[f];
  });
  informe.y = y0 + alto + 12;
}

function dibujarIndicadores(informe: Informe, indicadores: Indicador[]) {
  const { doc, fuentes, util, plantilla } = informe;
  const separacion = 8;
  const ancho = (util - separacion * (indicadores.length - 1)) / indicadores.length;
  const alto = 44;
  const y = informe.y;

  indicadores.forEach((indicador, i) => {
    const x = MARGEN.x + i * (ancho + separacion);
    doc.roundedRect(x, y, ancho, alto, 4).fillAndStroke(TINTA.blanco, TINTA.borde);
    doc.rect(x, y, ancho, 2.5).fill(indicador.tono ? colorDeTono(indicador.tono) : plantilla.colores.marca);
    doc
      .font(fuentes.media)
      .fontSize(6.5)
      .fillColor(TINTA.secundario)
      .text(indicador.etiqueta.toUpperCase(), x + 9, y + 9, { width: ancho - 18, characterSpacing: 0.5, lineBreak: false, ellipsis: true });
    doc
      .font(fuentes.negrita)
      .fontSize(15)
      .fillColor(colorDeTono(indicador.tono))
      .text(indicador.valor, x + 9, y + 20, { width: ancho - 18, lineBreak: false });
  });
  informe.y = y + alto + 14;
}

// ── Secciones y tablas ──────────────────────────────────────────────────────

/** Título de sección (el reporte completo tiene dos tablas). */
export function seccion(informe: Informe, titulo: string) {
  // Un título solo al pie de una página, con su tabla en la siguiente, se lee
  // como una sección vacía: se exige sitio para el título y un par de filas.
  asegurarEspacio(informe, 80);
  const { doc, fuentes, plantilla } = informe;
  doc.rect(MARGEN.x, informe.y + 3, 4, 11).fill(plantilla.colores.marca);
  doc
    .font(fuentes.negrita)
    .fontSize(12)
    .fillColor(TINTA.texto)
    .text(titulo, MARGEN.x + 10, informe.y, { width: informe.util - 10 });
  informe.y = doc.y + 8;
}

const RELLENO_X = 6;
const RELLENO_Y = 5;
const CUERPO = 8.5;
const ENCABEZADO = 7;
const ESPACIADO_ENCABEZADO = 0.4;
const ALTO_MINIMO_FILA = 20;
/** Alto del bloque de firmas; la tabla que lo precede lo reserva al final. */
const ALTO_FIRMAS = 76;

/** Cómo se dibuja una tabla ya medida. */
type Tabla = {
  columnas: ColumnaReporte[];
  anchos: number[];
  encabezados: string[];
  altoEncabezado: number;
};

/**
 * Cifras tabulares solo en columnas numéricas: alinean las notas por el punto,
 * pero en Inter también ensanchan el guion, y «SIS-301» o «2026-1» se leían
 * «SIS - 301».
 */
const esNumerica = (columna: ColumnaReporte) => columna.decimales != null || columna.align === 'right';

const cifras = (columna: ColumnaReporte, fuentes: Fuentes) => (esNumerica(columna) ? fuentes.cifras : []);

const opcionesCelda = (tabla: Tabla, i: number, fuentes: Fuentes) => ({
  width: tabla.anchos[i] - RELLENO_X * 2,
  align: tabla.columnas[i].align ?? 'left',
  lineGap: 1,
  features: cifras(tabla.columnas[i], fuentes),
});

const opcionesEncabezado = (tabla: Tabla, i: number, fuentes: Fuentes) => ({
  ...opcionesCelda(tabla, i, fuentes),
  characterSpacing: ESPACIADO_ENCABEZADO,
});

/**
 * Mínimo y preferido de cada columna (ver `repartirAnchos`). El mínimo es la
 * palabra más larga, con un tope para que una URL pegada en una observación no
 * se quede media tabla; el preferido es el texto completo más largo, con un
 * tope en proporción al ancho natural para que las 500 letras de una
 * observación no pidan la página entera.
 */
function medidasDeColumna(informe: Informe, columnas: ColumnaReporte[], encabezados: string[], filas: string[][]) {
  const { doc, fuentes, util } = informe;
  const relleno = RELLENO_X * 2 + 1;

  return columnas.map((columna, i) => {
    const features = cifras(columna, fuentes);
    const ancho = (texto: string) => doc.widthOfString(texto, { features });
    const palabraMasAncha = (texto: string) => Math.max(0, ...texto.split(/\s+/).filter(Boolean).map(ancho));

    doc.font(fuentes.negrita).fontSize(ENCABEZADO);
    const letras = encabezados[i].length * ESPACIADO_ENCABEZADO;
    let minimo = palabraMasAncha(encabezados[i]) + letras;
    let preferido = ancho(encabezados[i]) + letras;
    for (const fila of filas) {
      const celda = fila[i] ?? '';
      doc.font(columna.tono?.(celda) ? fuentes.media : fuentes.normal).fontSize(CUERPO);
      minimo = Math.max(minimo, palabraMasAncha(celda));
      preferido = Math.max(preferido, ancho(celda));
    }
    return {
      minimo: Math.min(minimo + relleno, util * 0.3),
      preferido: Math.min(preferido + relleno, columna.pdfWidth * 1.6),
    };
  });
}

function medirTabla(informe: Informe, columnas: ColumnaReporte[], filas: string[][]): Tabla {
  const { doc, fuentes, util } = informe;
  const encabezados = columnas.map(c => c.header.toUpperCase());
  const medidas = medidasDeColumna(informe, columnas, encabezados, filas);
  const anchos = repartirAnchos(
    medidas.map(m => m.preferido),
    medidas.map(m => m.minimo),
    util,
  );
  const tabla: Tabla = { columnas, anchos, encabezados, altoEncabezado: 0 };
  doc.font(fuentes.negrita).fontSize(ENCABEZADO);
  tabla.altoEncabezado =
    Math.max(...encabezados.map((texto, i) => doc.heightOfString(texto, opcionesEncabezado(tabla, i, fuentes)))) +
    RELLENO_Y * 2 + 2;
  return tabla;
}

function dibujarEncabezadoDeTabla(informe: Informe, tabla: Tabla) {
  const { doc, fuentes, plantilla, util } = informe;
  const fondo = plantilla.colores.encabezadoTabla;
  const y = informe.y;
  doc.rect(MARGEN.x, y, util, tabla.altoEncabezado).fill(fondo);
  doc.font(fuentes.negrita).fontSize(ENCABEZADO).fillColor(textoSobre(fondo));
  let x = MARGEN.x;
  tabla.encabezados.forEach((texto, i) => {
    const opciones = opcionesEncabezado(tabla, i, fuentes);
    const alto = doc.heightOfString(texto, opciones);
    doc.text(texto, x + RELLENO_X, y + (tabla.altoEncabezado - alto) / 2, opciones);
    x += tabla.anchos[i];
  });
  doc.rect(MARGEN.x, y + tabla.altoEncabezado - 1.5, util, 1.5).fill(TINTA.acento);
  informe.y = y + tabla.altoEncabezado;
}

function altoDeFila(informe: Informe, tabla: Tabla, fila: string[]): number {
  const { doc, fuentes } = informe;
  const alturas = fila.map((celda, i) => {
    doc.font(tabla.columnas[i].tono?.(celda) ? fuentes.media : fuentes.normal).fontSize(CUERPO);
    return doc.heightOfString(celda || ' ', opcionesCelda(tabla, i, fuentes));
  });
  return Math.max(ALTO_MINIMO_FILA, Math.max(...alturas) + RELLENO_Y * 2);
}

function dibujarFila(informe: Informe, tabla: Tabla, fila: string[], alto: number, cebra: boolean) {
  const { doc, fuentes, util } = informe;
  const y = informe.y;
  if (cebra) doc.rect(MARGEN.x, y, util, alto).fill(TINTA.cebra);

  let x = MARGEN.x;
  fila.forEach((celda, i) => {
    const tono = tabla.columnas[i].tono?.(celda) ?? null;
    const opciones = opcionesCelda(tabla, i, fuentes);
    doc.font(tono ? fuentes.media : fuentes.normal).fontSize(CUERPO).fillColor(colorDeTono(tono));
    const altoTexto = doc.heightOfString(celda || ' ', opciones);
    doc.text(celda, x + RELLENO_X, y + (alto - altoTexto) / 2, opciones);
    x += tabla.anchos[i];
  });

  doc.moveTo(MARGEN.x, y + alto).lineTo(MARGEN.x + util, y + alto).lineWidth(0.5).strokeColor(TINTA.borde).stroke();
  informe.y = y + alto;
}

function dibujarTablaVacia(informe: Informe, tabla: Tabla, vacio: string) {
  const { doc, fuentes, util } = informe;
  asegurarEspacio(informe, tabla.altoEncabezado + 30);
  dibujarEncabezadoDeTabla(informe, tabla);
  doc.rect(MARGEN.x, informe.y, util, 28).fill(TINTA.cebra);
  doc
    .font(fuentes.normal)
    .fontSize(9)
    .fillColor(TINTA.secundario)
    .text(vacio, MARGEN.x, informe.y + 9, { width: util, align: 'center' });
  informe.y += 28 + 16;
}

/** Filas que acompañan a las firmas: un bloque de firmas solo en una página no se sabe de qué acta es. */
const FILAS_CON_LAS_FIRMAS = 2;

/**
 * Dibuja la tabla de un catálogo de columnas.
 *
 * Cada fila mide lo que su celda más alta y nunca se parte entre dos páginas;
 * si no cabe, pasa entera a la siguiente con el encabezado repetido. Con
 * `antesDeFirmas`, las últimas filas se llevan a la página siguiente si las
 * firmas no caben detrás de ellas.
 */
export function tablaDeCatalogo(
  informe: Informe,
  columnas: ColumnaReporte[],
  filas: string[][],
  vacio: string,
  { antesDeFirmas = false }: { antesDeFirmas?: boolean } = {},
) {
  const tabla = medirTabla(informe, columnas, filas);
  if (!filas.length) {
    dibujarTablaVacia(informe, tabla, vacio);
    return;
  }

  const altos = filas.map(fila => altoDeFila(informe, tabla, fila));
  const reserva = antesDeFirmas && informe.firmas.length ? ALTO_FIRMAS : 0;
  // Desde qué fila el resto tiene que caber junto con las firmas.
  const colaDesde = reserva && filas.length > FILAS_CON_LAS_FIRMAS ? filas.length - FILAS_CON_LAS_FIRMAS : -1;
  const altoCola = colaDesde >= 0 ? altos.slice(colaDesde).reduce((s, a) => s + a, 0) : 0;

  asegurarEspacio(informe, tabla.altoEncabezado + altos[0]);
  dibujarEncabezadoDeTabla(informe, tabla);

  filas.forEach((fila, indice) => {
    // En `colaDesde` siempre hay ya una fila en la página (la anterior), así
    // que saltar no deja una página con el encabezado solo.
    const necesita = indice === colaDesde ? altoCola + reserva : altos[indice];
    if (informe.y + necesita > limite(informe)) {
      nuevaPagina(informe);
      dibujarEncabezadoDeTabla(informe, tabla);
    }
    dibujarFila(informe, tabla, fila, altos[indice], indice % 2 === 1);
  });
  informe.y += 16;
}

// ── Cierre ──────────────────────────────────────────────────────────────────

/** Líneas de firma al final del acta. */
function dibujarFirmas(informe: Informe) {
  const { doc, fuentes, util, firmas } = informe;
  if (!firmas.length) return;
  asegurarEspacio(informe, ALTO_FIRMAS);
  const ancho = Math.min(200, (util - 40 * (firmas.length - 1)) / firmas.length);
  const separacion = firmas.length > 1 ? (util - ancho * firmas.length) / (firmas.length - 1) : 0;
  const yLinea = informe.y + 44;

  firmas.forEach((firma, i) => {
    const x = MARGEN.x + i * (ancho + separacion);
    doc.moveTo(x, yLinea).lineTo(x + ancho, yLinea).lineWidth(0.8).strokeColor(TINTA.texto).stroke();
    doc
      .font(fuentes.media)
      .fontSize(8)
      .fillColor(TINTA.texto)
      .text(firma, x, yLinea + 5, { width: ancho, align: 'center' });
    doc
      .font(fuentes.normal)
      .fontSize(7)
      .fillColor(TINTA.secundario)
      .text('Nombre y firma', x, doc.y + 1, { width: ancho, align: 'center' });
  });
  informe.y = yLinea + 32;
}

/**
 * Pie de todas las páginas. Se dibuja al final, con las páginas en memoria,
 * porque hasta entonces no se sabe cuántas son.
 */
function dibujarPies(informe: Informe) {
  const { doc, fuentes, plantilla, util } = informe;
  const rango = doc.bufferedPageRange();
  for (let i = rango.start; i < rango.start + rango.count; i++) {
    doc.switchToPage(i);
    // Escribir por debajo del margen inferior hace que pdfkit abra una página
    // nueva por su cuenta; mientras se dibuja el pie, el margen es cero.
    const margenInferior = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;

    const y = informe.alto - 34;
    doc.moveTo(MARGEN.x, y).lineTo(MARGEN.x + util, y).lineWidth(0.5).strokeColor(TINTA.borde).stroke();
    doc
      .font(fuentes.normal)
      .fontSize(7)
      .fillColor(TINTA.secundario)
      .text(`${plantilla.institucion}  ·  Generado el ${informe.generado} con UTS Nexus Académico`, MARGEN.x, y + 7, {
        width: util * 0.75,
        lineBreak: false,
        ellipsis: true,
      });
    doc
      .font(fuentes.media)
      .fontSize(7)
      .fillColor(TINTA.texto)
      .text(`Página ${i - rango.start + 1} de ${rango.count}`, MARGEN.x + util * 0.75, y + 7, {
        width: util * 0.25,
        align: 'right',
        lineBreak: false,
      });

    doc.page.margins.bottom = margenInferior;
  }
}

/** Firmas, pies con la paginación y fin del documento. */
export function terminarPdf(informe: Informe) {
  dibujarFirmas(informe);
  dibujarPies(informe);
  informe.doc.end();
}
