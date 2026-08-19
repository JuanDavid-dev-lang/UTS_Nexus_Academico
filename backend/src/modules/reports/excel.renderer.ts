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
