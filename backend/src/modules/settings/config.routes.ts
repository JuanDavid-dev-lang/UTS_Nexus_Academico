import { Router } from 'express';
import { z } from 'zod';
import { identificar, requireRole } from '../../middlewares/auth.js';
import { ConfigModel } from '../../models/config.model.js';

export const configRouter = Router();
configRouter.use(identificar);

configRouter.get('/', requireRole('ADMIN', 'COORDINATOR'), async (_req, res, next) => {
  try {
    const items = await ConfigModel.find({ deletedAt: null }).lean();
    res.json({ ok: true, items });
  } catch (err) {
    next(err);
  }
});

configRouter.post('/', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const body = z.object({ key: z.string().min(1), value: z.any() }).parse(req.body);
    const item = await ConfigModel.findOneAndUpdate({ key: body.key }, { $set: body }, { upsert: true, new: true });
    res.status(201).json({ ok: true, item });
  } catch (err) {
    next(err);
  }
});

