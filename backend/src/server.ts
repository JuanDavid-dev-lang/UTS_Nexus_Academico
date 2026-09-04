import { createServer } from 'node:http';
import { app } from './app.js';
import { connectDb } from './shared/db.js';
import { createSocketServer } from './shared/socket.js';
import {
  startScheduler,
  startReleaseWatcher,
  startClassReminders,
  startActivityDueWatcher,
  startAttendancePatternScanner,
  startAnnouncementPublisher,
} from './shared/scheduler.js';
import { env, esProduccion, validarProduccion } from './shared/env.js';
import { asegurarPerfilesIniciales } from './shared/institutions-bootstrap.js';

// Antes de abrir el puerto, antes de conectar a la base y antes de aceptar una
// sola petición: si la configuración de producción es insegura, aquí se detiene.
validarProduccion();

const server = createServer(app);

/**
 * Plazos de la conexión, contra el goteo lento (Slowloris).
 *
 * Node no cierra por su cuenta una conexión que manda las cabeceras byte a
 * byte: se queda esperando. Unos cientos de conexiones así ocupan el proceso
 * entero sin llegar a enviar una sola petición completa, y desde fuera parece
 * que el servidor "se colgó" sin ningún error en el log.
 *
 * `keepAliveTimeout` va por encima del de Caddy a propósito: si el backend
 * cerrara primero, el proxy reutilizaría una conexión que el servidor acaba de
 * soltar y el docente vería un 502 de vez en cuando, sin patrón.
 */
server.headersTimeout = 20_000;
server.requestTimeout = 60_000;
server.keepAliveTimeout = 65_000;

createSocketServer(server);

/**
 * Red de seguridad del proceso.
 *
 * Un `await` sin `catch` en cualquier módulo tumbaba el proceso entero sin
 * dejar rastro de qué lo hizo: el contenedor reiniciaba, la sesión de todo el
 * mundo se cortaba y en el log no quedaba más que el reinicio.
 *
 * Aquí se registra qué pasó y **se sigue**: el estado del proceso tras una
 * promesa rechazada casi siempre es sano —una consulta que falló, un socket
 * que se cayó— y matarlo convierte un fallo local en una caída general.
 * `uncaughtException` sí es distinto: ahí el estado ya no es de fiar, así que
 * se deja de aceptar tráfico nuevo, se da margen a lo que esté en vuelo y se
 * sale con código de error para que el supervisor levante un proceso limpio.
 */
process.on('unhandledRejection', (causa) => {
  console.error('[proceso] promesa rechazada sin manejar:', causa);
});

process.on('uncaughtException', (error) => {
  console.error('[proceso] excepción no capturada:', error);
  server.close(() => process.exit(1));
  // Si las conexiones abiertas no dejan cerrar, no se espera indefinidamente.
  setTimeout(() => process.exit(1), 10_000).unref();
});

await connectDb();

// Perfiles institucionales iniciales (UTS, UIS, UDES) y docentes sin
// institución vinculados a las UTS. Idempotente; nunca detiene el arranque:
// sin perfiles el registro sigue funcionando, solo que con el selector vacío.
try {
  await asegurarPerfilesIniciales();
} catch (causa) {
  console.error('[instituciones] no se pudieron asegurar los perfiles iniciales:', causa);
}

server.listen(env.PORT, env.HOST, () => {
  const donde = esProduccion ? `${env.HOST}:${env.PORT}` : `http://localhost:${env.PORT}`;
  console.log(`API ready on ${donde} (${env.NODE_ENV})`);
  startScheduler();
  startReleaseWatcher();
  startClassReminders();
  startActivityDueWatcher();
  startAttendancePatternScanner();
  startAnnouncementPublisher();
});

