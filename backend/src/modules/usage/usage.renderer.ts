import ExcelJS from 'exceljs';
import { agregarFila, cerrarHoja, enviarExcel, prepararHoja, type ColumnaHoja } from '../reports/excel.renderer.js';
import type { Plantilla } from '../reports/report-template.js';
import type { Dato } from '../reports/report-summary.js';
import type { FilaRankingConNombre } from './usage.service.js';

/**
 * Exportable del ranking de uso. Cada celda sale por `agregarFila()`: el nombre
 * de una cuenta lo escribe una persona y Excel ejecutaría un `=` al abrirlo.
 * Es un documento interno de ADMIN: el membrete lo dice en el título.
 */
const COLUMNAS: ColumnaHoja[] = [
  { header: '#', key: 'posicion', excelWidth: 6, align: 'right', decimales: 0 },
  { header: 'Nombre', key: 'nombre', excelWidth: 30 },
  { header: 'Correo', key: 'correo', excelWidth: 28 },
  { header: 'Rol', key: 'rol', excelWidth: 14 },
  { header: 'Institución', key: 'institucion', excelWidth: 14 },
  { header: 'Días activos', key: 'diasActivos', excelWidth: 12, align: 'right', decimales: 0 },
  { header: 'Minutos', key: 'minutos', excelWidth: 10, align: 'right', decimales: 0 },
  { header: 'Peticiones', key: 'peticiones', excelWidth: 12, align: 'right', decimales: 0 },
  { header: 'Última actividad', key: 'ultima', excelWidth: 20 },
];

export async function enviarUsoExcel(
  res: { setHeader(name: string, value: string): void; send(body: Buffer): void },
  filas: FilaRankingConNombre[],
  filename: string,
  membrete: { plantilla: Plantilla; detalles: Dato[] },
) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Uso');
  const encabezado = prepararHoja(wb, ws, COLUMNAS, {
    titulo: 'Uso de la aplicación · estadística interna',
    plantilla: membrete.plantilla,
    detalles: membrete.detalles,
  });
  filas.forEach((f) =>
    agregarFila(ws, {
      posicion: f.posicion,
      nombre: f.nombre,
      correo: f.correo,
      rol: f.rol,
      institucion: f.institucion ?? '',
      diasActivos: f.diasActivos,
      minutos: f.minutos,
      peticiones: f.peticiones,
      ultima: new Date(f.ultimaActividad).toISOString().slice(0, 16).replace('T', ' ') + ' UTC',
    }),
  );
  cerrarHoja(ws, encabezado, COLUMNAS, membrete.plantilla);
  await enviarExcel(res, wb, filename);
}
