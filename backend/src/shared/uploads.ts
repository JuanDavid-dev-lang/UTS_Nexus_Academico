/**
 * Qué archivos acepta este sistema, y cómo se comprueba que lo son.
 *
 * Punto único porque la regla que protege es negativa —«esto NO puede
 * entrar»— y una regla negativa copiada en cinco rutas se cumple en cuatro.
 * Había exactamente ese problema: `uploads/` comprobaba la firma real del
 * archivo y componía el nombre entero en el servidor, que es lo correcto,
 * mientras que `thesis/` aceptaba con un **O** (mimetype declarado *o*
 * extensión del nombre) y los tres escáneres no comprobaban nada.
 *
 * Dos ideas que hay que tener claras al tocar esto:
 *
 * 1. **`file.mimetype` lo escribe el cliente.** Es una declaración, no una
 *    comprobación. Aceptar por mimetype sin mirar el contenido es aceptar la
 *    palabra de quien sube el archivo.
 * 2. **La extensión del nombre también la escribe el cliente.** Por eso el
 *    nombre con el que se guarda lo compone el servidor entero, y la extensión
 *    sale de este mapa y no de `path.extname(originalname)`.
 */
import multer from 'multer';
import type { Request } from 'express';

/** Tipo aceptado: cómo se declara, con qué extensión se guarda, cómo se reconoce. */
export type TipoAceptado = {
  mimetype: string;
  extension: string;
  /** ¿Los primeros bytes son los de este formato? */
  firma: (buffer: Buffer) => boolean;
};

const empiezaPor =
  (...bytes: number[]) =>
  (buffer: Buffer) =>
    bytes.every((b, i) => buffer[i] === b);

/** RIFF‥‥WEBP */
const esWebp = (buffer: Buffer) =>
  empiezaPor(0x52, 0x49, 0x46, 0x46)(buffer) && buffer.subarray(8, 12).toString('ascii') === 'WEBP';

/**
 * Contenedor ZIP. Es la firma de `.xlsx` y de `.docx`: los dos son ZIP por
 * dentro. No distingue uno de otro —para eso habría que abrir el contenedor—
 * pero sí descarta que sea un HTML, un script o un ejecutable, que es lo que
 * importa aquí.
 */
const esZip = (buffer: Buffer) =>
  empiezaPor(0x50, 0x4b, 0x03, 0x04)(buffer) ||
  empiezaPor(0x50, 0x4b, 0x05, 0x06)(buffer) ||
  empiezaPor(0x50, 0x4b, 0x07, 0x08)(buffer);

/** Documento OLE2: los `.doc` y `.xls` anteriores a Office 2007. */
const esOle2 = empiezaPor(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1);

const esPdf = empiezaPor(0x25, 0x50, 0x44, 0x46); // %PDF

export const IMAGENES: TipoAceptado[] = [
  { mimetype: 'image/jpeg', extension: '.jpg', firma: empiezaPor(0xff, 0xd8, 0xff) },
  {
    mimetype: 'image/png',
    extension: '.png',
    firma: empiezaPor(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a),
  },
  { mimetype: 'image/webp', extension: '.webp', firma: esWebp },
  { mimetype: 'image/gif', extension: '.gif', firma: empiezaPor(0x47, 0x49, 0x46, 0x38) },
];

export const PDF: TipoAceptado = { mimetype: 'application/pdf', extension: '.pdf', firma: esPdf };

export const DOCUMENTOS_WORD: TipoAceptado[] = [
  { mimetype: 'application/msword', extension: '.doc', firma: esOle2 },
  {
    mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    extension: '.docx',
    firma: esZip,
  },
];

export const HOJAS_DE_CALCULO: TipoAceptado[] = [
  { mimetype: 'application/vnd.ms-excel', extension: '.xls', firma: esOle2 },
  {
    mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    extension: '.xlsx',
    firma: esZip,
  },
];

/** Lo que aceptan los tres escáneres: una foto, un PDF o una hoja de cálculo. */
export const ENTRADA_DE_ESCANER: TipoAceptado[] = [...IMAGENES, PDF, ...HOJAS_DE_CALCULO];

/** Lo que acepta el repositorio de formatos de trabajo de grado. */
export const FORMATOS_INSTITUCIONALES: TipoAceptado[] = [PDF, ...DOCUMENTOS_WORD];

/** Error con `statusCode` para que `shared/error.ts` responda 400 y no un 500. */
function error400(mensaje: string): Error {
  return Object.assign(new Error(mensaje), { statusCode: 400 });
}

/**
 * Filtro de multer: descarta por el mimetype declarado **antes** de leer el
 * cuerpo.
 *
 * Es el primer corte, no el único: aquí todavía no hay bytes que mirar, así que
 * solo puede creerse lo que declara el cliente. La comprobación de verdad es
 * `exigirTipoReal()`, después de que multer haya leído el archivo.
 */
export function filtroPorMimetype(aceptados: TipoAceptado[], mensaje: string) {
  const permitidos = new Set(aceptados.map(t => t.mimetype));
  return (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    if (permitidos.has(file.mimetype)) return cb(null, true);
    cb(error400(mensaje));
  };
}

/**
 * Comprueba que el contenido sea de verdad lo que el cliente dijo, y devuelve
 * el tipo reconocido.
 *
 * Lanza un 400 si no coincide. Devolver el tipo en vez de un booleano es lo que
 * permite que quien llama saque de aquí la extensión y el `Content-Type` con
 * los que guardar y servir, en vez de arrastrar los del cliente.
 */
export function exigirTipoReal(
  file: { mimetype: string; buffer: Buffer },
  aceptados: TipoAceptado[],
): TipoAceptado {
  const tipo = aceptados.find(t => t.mimetype === file.mimetype);
  if (!tipo) throw error400('Tipo de archivo no permitido.');
  if (!tipo.firma(file.buffer)) {
    throw error400('El archivo no es un documento válido del tipo que declara.');
  }
  return tipo;
}

/**
 * Nombre con el que se guarda en disco. **Nada del cliente llega hasta aquí.**
 *
 * La extensión sale del tipo reconocido, no de `path.extname(originalname)`.
 * Con la extensión del cliente se podía dejar un `.html` o un `.svg` en la
 * carpeta de formatos: hoy no se sirve estática, pero el día que alguien la
 * exponga el fallo ya estaría escrito.
 */
export function nombreEnDisco(tipo: TipoAceptado): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}${tipo.extension}`;
}

/**
 * Sanea el nombre que se le propone al navegador en `Content-Disposition`.
 *
 * `res.setHeader` ya revienta con un salto de línea (`ERR_INVALID_CHAR`), así
 * que esto no evita una inyección de cabecera — evita el 500 que provocaría, y
 * quita las comillas que romperían el propio parámetro `filename`.
 */
export function nombreParaDescarga(propuesto: string | undefined, porDefecto: string): string {
  const limpio = (propuesto ?? '').replace(/[\r\n"\\]/g, '').trim();
  return limpio.slice(0, 120) || porDefecto;
}
