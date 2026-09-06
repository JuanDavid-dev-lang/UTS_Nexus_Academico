import { Router } from 'express';
import multer from 'multer';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { identificar, requireRole } from '../../middlewares/auth.js';
import { exigirTipoReal, filtroPorMimetype, IMAGENES, nombreEnDisco } from '../../shared/uploads.js';

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

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: filtroPorMimetype(IMAGENES, 'Solo se aceptan imágenes JPG, PNG, WebP o GIF.'),
});

const uploadDir = path.resolve(process.cwd(), 'uploads');

export const uploadRouter = Router();
uploadRouter.use(identificar);

uploadRouter.post('/image', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'), upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, message: 'File required' });

    // Comprueba la firma real y devuelve el tipo reconocido, del que salen la
    // extensión y el mimetype: los del cliente no se reutilizan.
    const tipo = exigirTipoReal(req.file, IMAGENES);

    await mkdir(uploadDir, { recursive: true });
    // El nombre lo compone el servidor entero: nada del cliente llega al disco.
    const filename = nombreEnDisco(tipo);
    const filepath = path.join(uploadDir, filename);
    await writeFile(filepath, req.file.buffer);

    res.status(201).json({
      ok: true,
      file: { filename, url: `/uploads/${filename}`, mimetype: tipo.mimetype, size: req.file.size },
    });
  } catch (err) {
    next(err);
  }
});
