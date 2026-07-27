import { createServer } from 'node:http';
import { app } from './app.js';
import { connectDb } from './shared/db.js';
import { createSocketServer } from './shared/socket.js';
import { startScheduler } from './shared/scheduler.js';
import { env } from './shared/env.js';

const server = createServer(app);
createSocketServer(server);

await connectDb();

server.listen(env.PORT, () => {
  console.log(`API ready on http://localhost:${env.PORT}`);
  startScheduler();
});

