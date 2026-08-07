import { createServer } from 'node:http';
import { app } from './app.js';
import { connectDb } from './shared/db.js';
import { createSocketServer } from './shared/socket.js';
import { startScheduler, startReleaseWatcher } from './shared/scheduler.js';
import { env, esProduccion, validarProduccion } from './shared/env.js';

// Antes de abrir el puerto, antes de conectar a la base y antes de aceptar una
// sola petición: si la configuración de producción es insegura, aquí se detiene.
validarProduccion();

const server = createServer(app);
createSocketServer(server);

await connectDb();

server.listen(env.PORT, env.HOST, () => {
  const donde = esProduccion ? `${env.HOST}:${env.PORT}` : `http://localhost:${env.PORT}`;
  console.log(`API ready on ${donde} (${env.NODE_ENV})`);
  startScheduler();
  startReleaseWatcher();
});

