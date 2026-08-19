import { Router } from 'express';
import multer from 'multer';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { identificar, requireRole } from '../../middlewares/auth.js';

/**
 * Subida de imágenes de perfil y adjuntos.
 *
 * Lo que se guarda aquí se sirve como estático público desde `/uploads`, y esa
 * es la razón de todo lo que sigue. Antes se aceptaba **cualquier** archivo y
 * la extensión se copiaba del nombre que mandaba el cliente: subir `foto.html`
 * dejaba una página servida por el propio origen de la API, con la sesión del
 * docente en el mismo sitio. No hacía falta ni saltarse nada, era el
 * comportamiento normal de `express.static`.
 *
 * Ahora la extensión la decide el servidor a partir del tipo declarado, se
 * comprueba además la firma real del archivo, y el nombre original no llega
 * nunca al disco.
 */

/** Tipos aceptados y la extensión con la que se guardan. La decide el servidor. */
const TIPOS_IMAGEN: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

/**
 * Firma real del archivo (números mágicos).
 *
 * El `mimetype` que llega en el formulario lo escribe el cliente: es una
 * declaración, no una comprobación. Un `.svg` con scripts declarado como
 * `image/png` pasaría el filtro de multer sin esto — y un SVG servido como
 * imagen sí ejecuta su contenido en el navegador.
 */
function firmaCoincide(buffer: Buffer, mimetype: string): boolean {
  const empieza = (...bytes: number[]) => bytes.every((b, i) => buffer[i] === b);

  switch (mimetype) {
    case 'image/jpeg':
      return empieza(0xff, 0xd8, 0xff);
    case 'image/png':
      return empieza(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    case 'image/gif':
      return empieza(0x47, 0x49, 0x46, 0x38);
    case 'image/webp':
      // RIFF....WEBP
      return empieza(0x52, 0x49, 0x46, 0x46) && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
    default:
      return false;
  }
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (TIPOS_IMAGEN[file.mimetype]) return cb(null, true);
    // Con `statusCode` para que el manejador lo traduzca a 400: un Error pelado
    // cae en 500 y el cliente lo reintenta solo, sin decir nunca qué pasa.
    cb(Object.assign(new Error('Solo se aceptan imágenes JPG, PNG, WebP o GIF.'), { statusCode: 400 }));
  },
});

const uploadDir = path.resolve(process.cwd(), 'uploads');

export const uploadRouter = Router();
uploadRouter.use(identificar);

uploadRouter.post('/image', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'), upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, message: 'File required' });

    const ext = TIPOS_IMAGEN[req.file.mimetype];
    if (!ext) return res.status(400).json({ ok: false, message: 'Tipo de imagen no permitido.' });

    if (!firmaCoincide(req.file.buffer, req.file.mimetype)) {
      return res.status(400).json({
        ok: false,
        message: 'El archivo no es una imagen válida del tipo que declara.',
      });
    }

    await mkdir(uploadDir, { recursive: true });
    // El nombre lo compone el servidor entero: nada del cliente llega al disco.
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    const filepath = path.join(uploadDir, filename);
    await writeFile(filepath, req.file.buffer);

    res.status(201).json({
      ok: true,
      file: { filename, url: `/uploads/${filename}`, mimetype: req.file.mimetype, size: req.file.size },
    });
  } catch (err) {
    next(err);
  }
});
