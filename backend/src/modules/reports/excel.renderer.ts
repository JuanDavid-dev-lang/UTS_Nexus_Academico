import ExcelJS from 'exceljs';
import type { ColumnaReporte } from './report-columns.js';
import { hexAArgb, logoDelDocumento, type Plantilla } from './report-template.js';
import { TINTA, altoDeFilaExcel, anchoExcel, colorDeTono, marcaComoTexto, textoSobre } from './report-layout.js';
import type { Dato, Indicador } from './report-summary.js';

/**
 * Generación de las hojas de Excel.
 *
 * Separado del PDF y de las rutas por el mismo motivo: son tres oficios que no
 * cambian por las mismas razones. Cambiar el ancho de una columna del acta
 * impresa no debería obligar a abrir el archivo donde se decide quién puede
 * descargarla.
 */

/**
 * Neutraliza una celda que Excel interpretaría como fórmula.
 *
 * Excel y LibreOffice ejecutan el contenido de cualquier celda que empiece por
 * `=`, `+`, `-`, `@`, tabulador o retorno de carro. Y las columnas de estos
 * informes son texto que escribe gente: el nombre de un estudiante llega por
 * importación de listado, por OCR de una foto o escrito a mano; la observación
 * de una asistencia son 500 caracteres libres del docente.
 *
 * Un estudiante llamado `=HYPERLINK("http://…"&A1,"Ver acta")` se ejecuta **en
 * la máquina de quien abre el acta**, que es coordinación o secretaría, y la
 * variante con `cmd|'/c …'!A0` sigue funcionando en instalaciones sin los
 * parches de DDE. No hace falta que el atacante sea nadie de dentro: basta que
 * el nombre entre por el escáner de una planilla.
 *
 * `shared/sanitize.ts` no cubría esto: sanea lo que se **guarda** en auditoría
 * y telemetría, no lo que **sale** hacia un archivo. Son dos fronteras
 * distintas y cada una necesita la suya.
 *
 * El apóstrofo inicial es el escape que Excel entiende: fuerza el contenido a
 * texto y no se ve al abrir el archivo.
 */
const ARRANQUE_DE_FORMULA = /^[=+\-@\t\r]/;

export function celdaSegura<T>(valor: T): T | string {
  if (typeof valor !== 'string') return valor;
  return ARRANQUE_DE_FORMULA.test(valor) ? `'${valor}` : valor;
}

/**
 * Añade una fila con todas sus celdas de texto neutralizadas.
 *
 * Se usa **en vez de** `ws.addRow()` en todo lo que salga de la base. Es una
 * función y no una regla escrita en una guía porque una regla negativa —«no
 * llames a addRow directamente»— se cumple en todos los sitios menos en el que
 * alguien añada dentro de un año.
 */
export function agregarFila(
  ws: ExcelJS.Worksheet,
  fila: Record<string, unknown> | unknown[],
) {
  // Las dos formas que `addRow` acepta y que este repositorio usa: el arreglo
  // posicional que devuelve `construirFilas()` y el objeto por clave de
  // `coordination.renderer.ts`.
  if (Array.isArray(fila)) return ws.addRow(fila.map(celdaSegura));

  const saneada: Record<string, unknown> = {};
  for (const [clave, valor] of Object.entries(fila)) saneada[clave] = celdaSegura(valor);
  return ws.addRow(saneada);
}

/** Lo que una hoja necesita saber de una columna: lo mismo que el catálogo del PDF. */
export type ColumnaHoja = Pick<ColumnaReporte, 'key' | 'header' | 'excelWidth' | 'align' | 'decimales' | 'tono'>;

export type MembreteHoja = {
  titulo: string;
  plantilla: Plantilla;
  /** Ficha del reporte: periodo, materia, grupo, fecha de generación. */
  detalles: Dato[];
  indicadores?: Indicador[];
};

const BORDE_FINO = { style: 'thin' as const, color: { argb: hexAArgb(TINTA.borde) } };
const imagenesDelLibro = new WeakMap<ExcelJS.Workbook, number>();
const SEPARADOR = '     ·     ';

/**
 * Membrete, encabezado de tabla y columnas de una hoja institucional.
 *
 * Antes la fila 1 era el encabezado y nada más: una hoja sin logo, sin título,
 * sin periodo y sin fecha, que impresa no decía de qué era. Ahora arriba va el
 * membrete —logo, institución, franja de marca, título, ficha e indicadores— y
 * la tabla empieza debajo. Devuelve el número de la fila de encabezado, que
 * `cerrarHoja` necesita.
 *
 * Lo que llega aquí desde la base —el nombre de una materia en la ficha— pasa
 * por `celdaSegura`, igual que las filas.
 */
export function prepararHoja(
  wb: ExcelJS.Workbook,
  ws: ExcelJS.Worksheet,
  columnas: ColumnaHoja[],
  membrete: MembreteHoja,
): number {
  const { plantilla } = membrete;
  const ultima = Math.max(columnas.length, 1);
  ws.columns = columnas.map(c => ({ key: c.key, width: c.excelWidth }));

  // El alto sale del texto y del ancho de la fila combinada (`altoDeFilaExcel`):
  // Excel no agranda solo una fila combinada. Se mide con los anchos mínimos
  // del catálogo, que `cerrarHoja` solo puede ensanchar: sobra alto, no falta.
  const texto = (numero: number, valor: string, fuente: Partial<ExcelJS.Font>, altoMinimo: number, desde = 1) => {
    const row = ws.getRow(numero);
    const ancho = columnas.slice(desde - 1).reduce((suma, c) => suma + c.excelWidth, 0) || 10;
    row.height = Math.max(altoMinimo, altoDeFilaExcel(valor, ancho, fuente.size ?? 10));
    if (ultima > desde) ws.mergeCells(numero, desde, numero, ultima);
    const celda = row.getCell(desde);
    celda.value = celdaSegura(valor);
    celda.font = { name: 'Calibri', ...fuente };
    celda.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
    return celda;
  };

  // Fila 1: logo a la izquierda e institución a la derecha. Con menos de tres
  // columnas no hay sitio para los dos sin que el logo tape el nombre.
  const logo = columnas.length >= 3 ? logoDelDocumento(plantilla) : null;
  if (logo) {
    // Un libro con dos hojas guarda el logo una vez, no una por hoja.
    const imagen = imagenesDelLibro.get(wb) ?? wb.addImage({ filename: logo.ruta, extension: logo.formato });
    imagenesDelLibro.set(wb, imagen);
    const alto = 70;
    ws.addImage(imagen, {
      tl: { col: 0.15, row: 0.1 },
      ext: { width: Math.round(alto * logo.proporcion), height: alto },
    });
  }
  const institucion = texto(1, plantilla.institucion, { bold: true, size: 12, color: { argb: hexAArgb(TINTA.texto) } }, 60, logo ? 3 : 1);
  institucion.alignment = { vertical: 'middle', horizontal: logo ? 'right' : 'left', wrapText: true };

  // Fila 2: franja de marca con el filete lima, como en el PDF.
  const franja = ws.getRow(2);
  franja.height = 5;
  for (let c = 1; c <= ultima; c++) {
    franja.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: hexAArgb(plantilla.colores.marca) } };
    franja.getCell(c).border = { bottom: { style: 'medium', color: { argb: hexAArgb(TINTA.acento) } } };
  }

  texto(3, membrete.titulo, { bold: true, size: 16, color: { argb: hexAArgb(marcaComoTexto(plantilla.colores.marca)) } }, 30);

  const ficha = membrete.detalles.map(d => `${d.etiqueta}: ${d.valor}`).join(SEPARADOR);
  texto(4, ficha, { size: 10, color: { argb: hexAArgb(TINTA.secundario) } }, 18);

  let siguiente = 5;
  if (membrete.indicadores?.length) {
    const resumen = membrete.indicadores.map(i => `${i.etiqueta}: ${i.valor}`).join(SEPARADOR);
    texto(5, resumen, { bold: true, size: 10, color: { argb: hexAArgb(TINTA.texto) } }, 18);
    siguiente = 6;
  }
  ws.getRow(siguiente).height = 8;

  const numeroEncabezado = siguiente + 1;
  const encabezado = ws.getRow(numeroEncabezado);
  const fondo = plantilla.colores.encabezadoExcel;
  encabezado.height = 30;
  columnas.forEach((columna, i) => {
    const celda = encabezado.getCell(i + 1);
    celda.value = columna.header;
    celda.font = { name: 'Calibri', bold: true, size: 10, color: { argb: hexAArgb(textoSobre(fondo)) } };
    celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: hexAArgb(fondo) } };
    celda.alignment = { vertical: 'middle', horizontal: columna.align ?? 'left', wrapText: true };
    celda.border = { bottom: { style: 'medium', color: { argb: hexAArgb(TINTA.acento) } } };
  });

  ws.views = [{ state: 'frozen', ySplit: numeroEncabezado, showGridLines: false }];
  // Por coordenadas y no por letra: `String.fromCharCode(64 + n)` se rompía a
  // partir de la columna 27.
  ws.autoFilter = { from: { row: numeroEncabezado, column: 1 }, to: { row: numeroEncabezado, column: ultima } };
  return numeroEncabezado;
}

/** `&` es el carácter de control de los encabezados y pies de página de Excel. */
const textoDePie = (valor: string) => valor.replace(/&/g, '&&');

/**
 * Estilo de las filas de datos, anchos y ajustes de impresión. Va después de
 * añadir las filas porque los anchos se miden con lo que contienen.
 */
export function cerrarHoja(
  ws: ExcelJS.Worksheet,
  numeroEncabezado: number,
  columnas: ColumnaHoja[],
  plantilla: Plantilla,
  vacio = 'Sin registros para los filtros elegidos.',
) {
  const ultimaFila = ws.rowCount;
  const ultima = Math.max(columnas.length, 1);

  if (ultimaFila <= numeroEncabezado) {
    const numero = numeroEncabezado + 1;
    if (ultima > 1) ws.mergeCells(numero, 1, numero, ultima);
    const celda = ws.getRow(numero).getCell(1);
    celda.value = vacio;
    celda.font = { name: 'Calibri', italic: true, size: 10, color: { argb: hexAArgb(TINTA.secundario) } };
    celda.alignment = { vertical: 'middle', horizontal: 'center' };
    ws.getRow(numero).height = 26;
  }

  const textos: string[][] = columnas.map(c => [c.header]);
  for (let r = numeroEncabezado + 1; r <= ultimaFila; r++) {
    const row = ws.getRow(r);
    const cebra = (r - numeroEncabezado) % 2 === 0;
    columnas.forEach((columna, i) => {
      const celda = row.getCell(i + 1);
      const valor = celda.value as string | number | null;
      const tono = valor == null ? null : (columna.tono?.(valor) ?? null);
      celda.font = { name: 'Calibri', size: 10, bold: Boolean(tono), color: { argb: hexAArgb(colorDeTono(tono)) } };
      celda.alignment = { vertical: 'middle', horizontal: columna.align ?? 'left', wrapText: true };
      celda.border = { bottom: BORDE_FINO };
      if (cebra) celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: hexAArgb(TINTA.cebra) } };
      if (typeof valor === 'number' && columna.decimales != null) {
        celda.numFmt = columna.decimales ? `0.${'0'.repeat(columna.decimales)}` : '0';
        textos[i].push(valor.toFixed(columna.decimales));
      } else {
        textos[i].push(valor == null ? '' : String(valor));
      }
    });
  }

  columnas.forEach((columna, i) => {
    ws.getColumn(i + 1).width = anchoExcel(textos[i], columna.excelWidth, 50);
  });

  ws.pageSetup = {
    ...ws.pageSetup,
    paperSize: 9, // A4
    orientation: columnas.length > 5 ? 'landscape' : 'portrait',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    horizontalCentered: true,
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.6, header: 0.3, footer: 0.3 },
    // El encabezado de la tabla se repite en cada hoja impresa.
    printTitlesRow: `${numeroEncabezado}:${numeroEncabezado}`,
  };
  ws.headerFooter = {
    ...ws.headerFooter,
    oddFooter: `&L&8${textoDePie(plantilla.institucion)} · UTS Nexus Académico&R&8Página &P de &N`,
  };
}

/** Una hoja completa desde el catálogo: membrete, filas saneadas, estilo e impresión. */
export function hojaDeCatalogo(
  wb: ExcelJS.Workbook,
  nombre: string,
  columnas: ColumnaReporte[],
  filas: (string | number)[][],
  membrete: MembreteHoja,
  vacio?: string,
): ExcelJS.Worksheet {
  const ws = wb.addWorksheet(nombre, {
    properties: { tabColor: { argb: hexAArgb(membrete.plantilla.colores.marca) } },
  });
  const encabezado = prepararHoja(wb, ws, columnas, membrete);
  filas.forEach(fila => agregarFila(ws, fila));
  cerrarHoja(ws, encabezado, columnas, membrete.plantilla, vacio);
  return ws;
}

/** Envía el libro como descarga. */
export async function enviarExcel(
  res: { setHeader(name: string, value: string): void; send(body: Buffer): void },
  wb: ExcelJS.Workbook,
  filename: string,
) {
  wb.creator = 'UTS Nexus Académico';
  wb.created = new Date();
  const buffer = await wb.xlsx.writeBuffer();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(Buffer.from(buffer));
}
