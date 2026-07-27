import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import path from 'node:path';
import { apiRouter } from './routes/index.js';
import { swaggerSpec } from './shared/swagger.js';
import { errorHandler } from './shared/error.js';
import { env } from './shared/env.js';

export const app = express();

app.use(helmet());
app.use(cors({ origin: env.CLIENT_ORIGIN, credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(morgan('dev'));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 250 }));
app.use('/uploads', express.static(path.resolve(process.cwd(), 'uploads')));
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use('/api/v1', apiRouter);
app.get('/health', (_req, res) => res.json({ ok: true }));
app.use(errorHandler);
