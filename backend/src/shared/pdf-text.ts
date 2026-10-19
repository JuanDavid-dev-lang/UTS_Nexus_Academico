/**
 * Capa de texto de un PDF, con la posición de cada trozo.
 *
 * Existe para los reportes que exportan los sistemas institucionales
 * (Academusoft): traen el texto exacto, y leerlo aquí evita mandarlos al
 * reconocimiento de imágenes, que solo puede empeorarlo, y no depender de que
 * el servicio de visión esté arriba.
 *
 * `unpdf` envuelve pdf.js, que es JavaScript: no hay parser nativo de por
 * medio. Aun así el archivo lo manda un cliente, así que se acotan las páginas
 * —un reporte de notas son dos o tres— y cualquier fallo devuelve `null`: quien
 * llama sigue por el camino de siempre en vez de responder un 500.
 */
import { getDocumentProxy } from 'unpdf';
import type { ElementoDeTexto } from '../domains/grading/academusoft.js';

/** Un listado de 500 estudiantes son unas 15 páginas; más que esto no es un reporte de notas. */
const MAX_PAGINAS = 40;

type ItemDeTexto = { str: string; transform: number[]; width: number };

export async function elementosDeTextoPdf(buffer: Buffer): Promise<ElementoDeTexto[] | null> {
  try {
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    try {
      if (pdf.numPages > MAX_PAGINAS) return null;
      const elementos: ElementoDeTexto[] = [];
      for (let numero = 1; numero <= pdf.numPages; numero++) {
        const pagina = await pdf.getPage(numero);
        const contenido = await pagina.getTextContent();
        for (const item of contenido.items as Array<Partial<ItemDeTexto>>) {
          if (typeof item.str !== 'string' || !item.str.trim() || !item.transform) continue;
          elementos.push({
            texto: item.str,
            x: item.transform[4] ?? 0,
            y: item.transform[5] ?? 0,
            ancho: item.width ?? 0,
            pagina: numero,
          });
        }
      }
      return elementos;
    } finally {
      // `destroy` vive en la tarea de carga, no en el documento.
      await pdf.loadingTask.destroy();
    }
  } catch {
    // Cifrado, dañado o sin capa de texto que leer: decide quien llama.
    return null;
  }
}
