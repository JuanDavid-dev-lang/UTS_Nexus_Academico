import path from 'node:path';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { createReadStream, existsSync } from 'node:fs';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { ThesisFormatModel } from '../../models/thesis-format.model.js';
import { identificar, requireRole } from '../../middlewares/auth.js';
import { requireDirector } from '../../middlewares/director.js';
import { auditChange } from '../../shared/audit.js';
import { emitSync } from '../../shared/socket.js';
import {
  exigirTipoReal,
  filtroPorMimetype,
  FORMATOS_INSTITUCIONALES,
  nombreEnDisco,
  nombreParaDescarga,
} from '../../shared/uploads.js';

/**
 * Repositorio de formatos oficiales de trabajo de grado.
 *
 * La administración sube y mantiene los formatos; los docentes directores los
 * encuentran por etapa y los descargan. Los archivos se guardan en
 * `formatos/`, NUNCA en `uploads/`: esa carpeta se sirve estática sin
 * autenticación y un formato debe salir solo por la ruta autenticada de abajo.
 */
export const thesisRouter = Router();
thesisRouter.use(identificar);

const CARPETA = path.resolve(process.cwd(), 'formatos');

const ETAPAS = ['PROPUESTA', 'DESARROLLO', 'INFORME_FINAL', 'EVALUACION', 'GRADO'] as const;

/**
 * Word y PDF: lo que la institución publica. Cualquier otra cosa se rechaza.
 *
 * El filtro aceptaba con **O** —`MIMES.has(file.mimetype) ||
 * EXTENSIONES.test(file.originalname)`— y los dos lados de ese `||` los escribe
 * el cliente, así que bastaba cumplir uno. Un archivo llamado `guia.pdf` con
 * `Content-Type: text/html` pasaba, ese mimetype quedaba guardado en la ficha, y
 * la ruta de descarga lo devolvía tal cual en la cabecera: HTML servido desde el
 * origen de la API. Lo único que lo salvaba era el `attachment` de la línea
 * siguiente, es decir, la suerte.
 *
 * Ahora los tipos aceptados y su reconocimiento por firma viven en
 * `shared/uploads.ts`, igual que en `POST /uploads/image`.
 */
const subirFormato = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 1 },
  fileFilter: filtroPorMimetype(
    FORMATOS_INSTITUCIONALES,
    'Solo se aceptan formatos Word (.doc/.docx) o PDF.',
  ),
});

/** Mimetype de salida por extensión guardada. El del cliente no se reutiliza. */
const MIMETYPE_POR_EXTENSION = new Map(
  FORMATOS_INSTITUCIONALES.map(tipo => [tipo.extension, tipo.mimetype]),
);

const metadatos = z.object({
  nombre: z.string().trim().min(4).max(160),
  descripcion: z.string().trim().max(1000).default(''),
  etapa: z.enum(ETAPAS),
  /** Llegan como JSON o como texto separado por saltos de línea. */
  modalidades: z.union([z.array(z.string()), z.string()]).optional(),
  camposALlenar: z.union([z.array(z.string()), z.string()]).optional(),
  version: z.string().trim().max(20).default('1'),
});

function aLista(valor: string[] | string | undefined): string[] {
  if (!valor) return [];
  if (Array.isArray(valor)) return valor.map(v => v.trim()).filter(Boolean);
  try {
    const parsed = JSON.parse(valor);
    if (Array.isArray(parsed)) return parsed.map(v => String(v).trim()).filter(Boolean);
  } catch {
    /* no era JSON: texto plano */
  }
  return valor.split(/\r?\n/).map(v => v.trim()).filter(Boolean);
}

/** Subir un formato (solo administración). */
thesisRouter.post(
  '/formatos',
  requireRole('ADMIN', 'COORDINATOR'),
  subirFormato.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ ok: false, message: 'Falta el archivo del formato.' });
      const datos = metadatos.parse(req.body);

      // Segundo corte, el que de verdad comprueba: los primeros bytes tienen
      // que ser los del formato declarado. El primero (el `fileFilter`) solo
      // pudo creerse la palabra del cliente, porque aún no había bytes.
      const tipo = exigirTipoReal(req.file, FORMATOS_INSTITUCIONALES);

      await mkdir(CARPETA, { recursive: true });
      // La extensión sale del tipo reconocido, no del nombre que mandó el
      // cliente: con `path.extname(originalname)` se podía dejar un `.html` o
      // un `.svg` en esta carpeta.
      const filename = nombreEnDisco(tipo);
      await writeFile(path.join(CARPETA, filename), req.file.buffer);

      const item = await ThesisFormatModel.create({
        nombre: datos.nombre,
        descripcion: datos.descripcion,
        etapa: datos.etapa,
        modalidades: aLista(datos.modalidades),
        camposALlenar: aLista(datos.camposALlenar),
        version: datos.version,
        archivo: {
          filename,
          originalName: nombreParaDescarga(req.file.originalname, `formato${tipo.extension}`),
          // El reconocido, no el declarado: es lo que se devolverá al descargar.
          mimetype: tipo.mimetype,
          size: req.file.size,
        },
        subidoPor: req.user?.id,
      });

      await auditChange({
        actorId: req.user?.id,
        action: 'CREATE',
        entity: 'FormatoTrabajoGrado',
        entityId: item.id,
        after: item.toObject(),
      });
      // Broadcast: el catálogo de formatos es institucional, no sensible.
      emitSync('sync:update', { entity: 'thesisFormat', action: 'create', id: item.id });
      res.status(201).json({ ok: true, item });
    } catch (err) {
      next(err);
    }
  }
);

/** Catálogo, filtrable por etapa y por texto. Solo directores (y administración). */
thesisRouter.get('/formatos', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'), requireDirector, async (req, res, next) => {
  try {
    const filtro: Record<string, unknown> = { deletedAt: null };
    if (req.query.etapa && (ETAPAS as readonly string[]).includes(String(req.query.etapa))) {
      filtro.etapa = String(req.query.etapa);
    }
    if (req.query.q) {
      const escapado = String(req.query.q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const patron = new RegExp(escapado, 'i');
      filtro.$or = [{ nombre: patron }, { descripcion: patron }];
    }

    const items = await ThesisFormatModel.find(filtro).sort({ etapa: 1, nombre: 1 }).limit(200).lean();
    res.json({ ok: true, items });
  } catch (err) {
    next(err);
  }
});

/** Descarga autenticada del archivo. */
thesisRouter.get('/formatos/:id/archivo', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'), requireDirector, async (req, res, next) => {
  try {
    const item = await ThesisFormatModel.findOne({ _id: req.params.id, deletedAt: null }).lean();
    if (!item?.archivo?.filename) return res.status(404).json({ ok: false, message: 'Formato no encontrado.' });

    const ruta = path.join(CARPETA, path.basename(item.archivo.filename));
    if (!existsSync(ruta)) {
      return res.status(410).json({ ok: false, message: 'El archivo de este formato ya no está en el servidor.' });
    }

    /**
     * El `Content-Type` se deriva de la extensión **con la que el servidor
     * guardó** el archivo, no del campo `mimetype` de la ficha.
     *
     * La diferencia importa para los formatos subidos antes de que el filtro
     * comprobara la firma: en aquellos, `mimetype` es lo que declaró el
     * cliente. Derivarlo de la extensión los normaliza sin tener que migrar la
     * colección, y deja el peor caso en `application/octet-stream`.
     */
    const extension = path.extname(item.archivo.filename).toLowerCase();
    res.setHeader('Content-Type', MIMETYPE_POR_EXTENSION.get(extension) ?? 'application/octet-stream');
    // `nosniff` para que el navegador no adivine otro tipo a partir del
    // contenido, que es como un `attachment` acaba ejecutándose igualmente.
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const nombre = nombreParaDescarga(item.archivo.originalName ?? undefined, `formato${extension}`);
    res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
    createReadStream(ruta).pipe(res);
  } catch (err) {
    next(err);
  }
});

/** Editar metadatos (el archivo se reemplaza subiendo un formato nuevo). */
thesisRouter.patch('/formatos/:id', requireRole('ADMIN', 'COORDINATOR'), async (req, res, next) => {
  try {
    const datos = metadatos.partial().parse(req.body);
    const cambios: Record<string, unknown> = { ...datos };
    if (datos.modalidades !== undefined) cambios.modalidades = aLista(datos.modalidades);
    if (datos.camposALlenar !== undefined) cambios.camposALlenar = aLista(datos.camposALlenar);

    const item = await ThesisFormatModel.findOneAndUpdate(
      { _id: req.params.id, deletedAt: null },
      { $set: cambios },
      { new: true }
    );
    if (!item) return res.status(404).json({ ok: false, message: 'Formato no encontrado.' });

    await auditChange({ actorId: req.user?.id, action: 'UPDATE', entity: 'FormatoTrabajoGrado', entityId: item.id, after: item.toObject() });
    emitSync('sync:update', { entity: 'thesisFormat', action: 'update', id: item.id });
    res.json({ ok: true, item });
  } catch (err) {
    next(err);
  }
});

thesisRouter.delete('/formatos/:id', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const item = await ThesisFormatModel.findOneAndUpdate(
      { _id: req.params.id, deletedAt: null },
      { $set: { deletedAt: new Date(), status: 'DELETED' } },
      { new: true }
    );
    if (!item) return res.status(404).json({ ok: false, message: 'Formato no encontrado.' });

    // Baja lógica en la base y borrado físico del archivo: un documento
    // institucional retirado no debe seguir descargable.
    if (item.archivo?.filename) {
      const ruta = path.join(CARPETA, path.basename(item.archivo.filename));
      if (existsSync(ruta)) await unlink(ruta).catch(() => undefined);
    }

    await auditChange({ actorId: req.user?.id, action: 'DELETE', entity: 'FormatoTrabajoGrado', entityId: item.id });
    emitSync('sync:update', { entity: 'thesisFormat', action: 'delete', id: item.id });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
