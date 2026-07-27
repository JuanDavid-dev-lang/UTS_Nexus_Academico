import { Router } from 'express';
import multer from 'multer';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { auth, requireRole } from '../../middlewares/auth.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });
const uploadDir = path.resolve(process.cwd(), 'uploads');

export const uploadRouter = Router();
uploadRouter.use(auth);

uploadRouter.post('/image', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'), upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, message: 'File required' });
    await mkdir(uploadDir, { recursive: true });
    const ext = path.extname(req.file.originalname) || '.bin';
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

