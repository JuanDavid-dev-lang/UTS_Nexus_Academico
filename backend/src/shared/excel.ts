/**
 * Lectura de hojas de cálculo subidas por el docente.
 *
 * Punto único: antes `enrollment` y `grade-scan` llevaban cada uno su copia de
 * este helper, y el fallo que motivó este archivo habría habido que
 * arreglarlo dos veces.
 *
 * Dos parsers a propósito. `exceljs` es el titular, pero se cae con archivos
 * reales: los «Excel» que exportan los sistemas institucionales (y LibreOffice
 * o WPS con rutas absolutas en las relaciones internas) lo tumban con
 * `Cannot read properties of undefined (reading 'sheets')` — un 500 que al
 * docente le llegaba como «el servidor tuvo un problema». SheetJS tolera esos
 * archivos y además lee `.xls` viejos. Solo si los dos fallan el archivo no
 * es una hoja de cálculo, y eso es un 400 con explicación, no un 500.
 */
import ExcelJS from 'exceljs';
import * as SheetJS from 'xlsx';

const EXCEL_MIMES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
]);

export function esExcel(file: { mimetype: string; originalname: string }): boolean {
  return EXCEL_MIMES.has(file.mimetype) || /\.xlsx?$/i.test(file.originalname);
}

/** Primera hoja del libro como matriz de textos. */
export async function excelAMatriz(buffer: Buffer): Promise<string[][]> {
  try {
    return await conExceljs(buffer);
  } catch {
    // Sigue el respaldo; si también falla, el error legible sale de allí.
  }

  try {
    return conSheetjs(buffer);
  } catch {
    const error = new Error(
      'El archivo no se pudo leer como hoja de cálculo. Guárdalo desde Excel ' +
        'como .xlsx, o exporta la lista como CSV.'
    );
    (error as Error & { statusCode: number }).statusCode = 400;
    throw error;
  }
}

async function conExceljs(buffer: Buffer): Promise<string[][]> {
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(buffer as unknown as ArrayBuffer);
  const hoja = libro.worksheets[0];
  if (!hoja) return [];

  const matriz: string[][] = [];
  hoja.eachRow({ includeEmpty: false }, fila => {
    const celdas: string[] = [];
    fila.eachCell({ includeEmpty: true }, celda => {
      const valor = celda.value;
      // `text` resuelve fórmulas y rich text; los números conservan el punto.
      celdas.push(valor === null || valor === undefined ? '' : String(celda.text ?? valor));
    });
    matriz.push(celdas);
  });
  return matriz;
}

function conSheetjs(buffer: Buffer): string[][] {
  const libro = SheetJS.read(buffer, { type: 'buffer' });
  const hoja = libro.Sheets[libro.SheetNames[0] ?? ''];
  if (!hoja) return [];

  // `raw: false` aplica el formato de celda: una cédula guardada como número
  // sale como texto plano y no en notación científica.
  const filas = SheetJS.utils.sheet_to_json<string[]>(hoja, {
    header: 1,
    raw: false,
    defval: '',
  });
  return filas
    .map(fila => fila.map(celda => String(celda ?? '')))
    .filter(fila => fila.some(celda => celda.trim() !== ''));
}
