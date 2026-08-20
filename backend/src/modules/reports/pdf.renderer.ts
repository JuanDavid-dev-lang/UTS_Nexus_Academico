import path from 'node:path';
import fs from 'node:fs';
import PDFDocument from 'pdfkit';
import type { ColumnaReporte } from './report-columns.js';
import type { Plantilla } from './report-template.js';

/**
 * Dibujo de los PDF.
 *
 * Todo lo que sabe de pdfkit vive aquí y en ningún otro sitio. Estaba mezclado
 * con las rutas, y eso hacía que el archivo de reportes tuviera que entender a
 * la vez de HTTP, de consultas a Mongo, de hojas de Excel y de coordenadas en
 * puntos tipográficos: cuatro oficios que no cambian por los mismos motivos.
 *
 * Estos PDF son actas que el docente imprime y entrega, así que las decisiones
 * de aquí no son cosméticas.
 */

/** Fecha en formato ISO corto para las líneas de encabezado del reporte. */
export function formatDate(value: unknown): string {
  const date = new Date(value as any);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

/** Abre el documento y lo enchufa a la respuesta, con el membrete ya dibujado. */
export function startPdf(
  title: string,
  filename: string,
  res: NodeJS.WritableStream & { setHeader(name: string, value: string): void },
  plantilla: Plantilla,
) {
  const doc = new PDFDocument({ margin: 32, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  doc.pipe(res);
  drawHeader(doc, title, plantilla);
  return doc;
}

export function drawHeader(doc: any, title: string, plantilla: Plantilla) {
  // Membrete, en orden de preferencia: el logo que subió la administración,
  // el logo institucional de la UTS que viaja empaquetado con el backend, y
  // solo si ninguno se puede leer, el recuadro con la sigla. Un logo corrupto
  // no debe tumbar el acta que el docente entrega.
  let logoDibujado = false;
  const candidatos: string[] = [];
  if (plantilla.logoUrl) {
    candidatos.push(path.join(process.cwd(), 'uploads', path.basename(plantilla.logoUrl)));
  }
  candidatos.push(path.join(process.cwd(), 'assets', 'logo-uts.png'));
  for (const ruta of candidatos) {
    if (!fs.existsSync(ruta)) continue;
    try {
      doc.image(ruta, 32, 26, { fit: [58, 58] });
      logoDibujado = true;
      break;
    } catch {
      logoDibujado = false;
    }
  }
  if (!logoDibujado) {
    doc.roundedRect(32, 26, 58, 58, 12).fillAndStroke(plantilla.colores.marca, plantilla.colores.marca);
    doc.fillColor('#081115').font('Helvetica-Bold').fontSize(24).text(plantilla.sigla, 44, 48);
  }
  doc.fillColor('#0b1115').font('Helvetica-Bold').fontSize(22).text(title, 108, 38);
  // "Universidad de Santander" es OTRA institución (UDES). Estos PDF son actas
  // que el docente entrega, así que el nombre tiene que ser el correcto.
  doc.fillColor('#9fb0bb').font('Helvetica').fontSize(10).text(plantilla.institucion, 108, 64);
  doc.moveTo(32, 94).lineTo(562, 94).strokeColor('#23323c').lineWidth(1).stroke();
  doc.moveDown(1.8);
}

export function table(
  doc: any,
  headers: string[],
  rows: string[][],
  widths: number[],
  headerFill = '#d7f0e5',
) {
  const startX = 32;
  let y = doc.y;
  const rowHeight = 20;
  // Límite inferior útil de la página (deja margen de 40pt abajo).
  const bottomLimit = () => doc.page.height - 40;

  const drawRow = (cells: string[], isHeader = false) => {
    let x = startX;
    doc.font(isHeader ? 'Helvetica-Bold' : 'Helvetica').fontSize(9);
    cells.forEach((cell, i) => {
      // 1) Fondo de la celda. 2) SIEMPRE se re-fija fillColor antes del texto,
      // porque fillAndStroke deja el color de relleno activo y el texto lo heredaría
      // (esa herencia es la causa de la "letra ilegible").
      doc
        .rect(x, y, widths[i], rowHeight)
        .fillAndStroke(isHeader ? headerFill : '#f7fbfc', '#dbe6ec');
      doc
        .fillColor(isHeader ? '#0b1115' : '#18242c')
        .text(cell, x + 4, y + 6, { width: widths[i] - 8, ellipsis: true, lineBreak: false });
      x += widths[i];
    });
    y += rowHeight;
  };

  drawRow(headers, true);
  rows.forEach(row => {
    // Salto de página: si la siguiente fila no cabe, nueva página + repetir encabezado.
    if (y + rowHeight > bottomLimit()) {
      doc.addPage();
      y = doc.page.margins.top;
      drawRow(headers, true);
    }
    drawRow(row);
  });
  doc.y = y + 8;
}

/** Dibuja en el PDF la tabla de un catálogo de columnas. */
export function tablaDeCatalogo(
  doc: any,
  columnas: ColumnaReporte[],
  filas: string[][],
  plantilla: Plantilla,
) {
  table(
    doc,
    columnas.map(c => c.header),
    filas,
    columnas.map(c => c.pdfWidth),
    plantilla.colores.encabezadoTabla,
  );
}
