import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import compression from 'compression';
import swaggerUi from 'swagger-ui-express';
import path from 'node:path';
import { apiRouter } from './routes/index.js';
import { swaggerSpec } from './shared/swagger.js';
import { errorHandler } from './shared/error.js';
import { dbStatus } from './shared/db.js';
import { esProduccion, origenesPermitidos } from './shared/env.js';

export const app = express();

// Detrás de un proxy inverso, sin esto Express ve la IP del proxy en todas las
// peticiones: el limitador de tasa contaría a todo el mundo como un solo
// cliente y bastaría un usuario para agotar el cupo de los demás.
if (esProduccion) app.set('trust proxy', 1);

app.use(helmet());
app.use(cors({ origin: origenesPermitidos(), credentials: true }));

/**
 * Compresión de las respuestas.
 *
 * Caddy ya comprime lo que sale por él, pero **no todo sale por él**: el móvil
 * se conecta directo a `http://ip:4000` en la red del campus, y `iniciar.sh`
 * levanta el backend solo. En esos caminos no había compresión ninguna, y el
 * consolidado de un grupo son cientos de kilobytes de JSON muy repetitivo
 * sobre el wifi de un aula, que es donde peor se nota.
 *
 * Detrás del proxy no se hace el trabajo dos veces: Caddy deja pasar tal cual
 * lo que ya llega con `Content-Encoding`.
 */
app.use(compression());

app.use(express.json({ limit: '2mb' }));
app.use(morgan(esProduccion ? 'combined' : 'dev'));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 250 }));

// El login se limita aparte y mucho más fuerte que el resto de la API. En una
// red local el riesgo de fuerza bruta era teórico; en internet es constante, y
// el cupo general de 250 peticiones deja sitio de sobra para probar contraseñas.
if (esProduccion) {
  app.use(
    '/api/v1/auth/login',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 10,
      // Se cuenta por IP; un docente que se equivoca dos veces no se ve afectado.
      message: { ok: false, message: 'Demasiados intentos. Espera unos minutos.' },
    }),
  );
}
app.use('/uploads', express.static(path.resolve(process.cwd(), 'uploads')));
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use('/api/v1', apiRouter);
/**
 * Sonda de salud.
 *
 * Informa del estado de la base de datos además del propio servidor: un cliente
 * que solo sabe "el servidor responde" no puede distinguir entre "todo bien" y
 * "el servidor está vivo pero no alcanza la base", que es justo la diferencia
 * entre un login que funciona y uno que falla a los 10 segundos.
 */
app.get('/health', (_req, res) => {
  const db = dbStatus();
  res.json({ ok: true, db: db.status, dbError: db.error });
});
app.use(errorHandler);
