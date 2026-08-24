import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import { origenesPermitidos } from './env.js';
import { verifyAccessToken } from './jwt.js';

let io: Server | null = null;

type SocketUser = { id: string; role: string };

function extractToken(socket: Socket): string | null {
  const authToken = (socket.handshake.auth as { token?: string })?.token;
  if (authToken) return authToken;
  const queryToken = socket.handshake.query?.token;
  if (typeof queryToken === 'string') return queryToken;
  const header = socket.handshake.headers?.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return null;
}

export function createSocketServer(server: HttpServer) {
  io = new Server(server, {
    // La misma lista que la API, resuelta con `origenesPermitidos()` y no con
    // `env.CLIENT_ORIGIN` en crudo. En producción esa variable es
    // obligatoriamente una lista separada por comas, así que pasarla tal cual
    // le daba a Socket.io la cadena literal "https://a,https://b" como si
    // fuera un único origen: no casaba con ninguna cabecera `Origin` y el
    // tiempo real quedaba caído sin un solo error que mencionara CORS.
    cors: { origin: origenesPermitidos(), credentials: true },
  });

  // Autenticación del handshake: solo clientes con token válido se conectan.
  io.use((socket, next) => {
    const token = extractToken(socket);
    if (!token) return next(new Error('unauthorized'));
    try {
      const payload = verifyAccessToken(token);
      (socket.data as { user?: SocketUser }).user = { id: payload.sub, role: payload.role };
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', socket => {
    const user = (socket.data as { user?: SocketUser }).user;
    if (user) {
      // Cada usuario recibe solo lo suyo; los ADMIN/COORDINATOR además escuchan global.
      socket.join(`user:${user.id}`);
      socket.join(`role:${user.role}`);
    }
    socket.emit('sync:ready', { ok: true });
    socket.on('sync:ping', () => socket.emit('sync:pong', { ts: Date.now() }));
  });
}

/** Sincronización institucional para todas las salas autenticadas, nunca sockets anónimos. */
export function emitSync(event: string, payload: unknown) {
  io?.to('role:ADMIN')
    .to('role:COORDINATOR')
    .to('role:PROFESSOR')
    .to('role:STUDENT')
    .emit(event, payload);
}

/**
 * Emite solo a quien administra.
 *
 * Lo que únicamente ADMIN o COORDINATOR pueden leer no tiene por qué llegarle a
 * todos los docentes conectados: el oyente invalida su caché, pide el listado y
 * recibe un 403 —una petición inútil por cada docente conectado y por cada
 * cambio—. La cola de solicitudes de registro es exactamente eso.
 */
export function emitToAdmins(event: string, payload: unknown) {
  io?.to('role:ADMIN').to('role:COORDINATOR').emit(event, payload);
}

/** Emite un evento solo a un usuario concreto (y a admins/coordinadores). */
export function emitToUser(userId: string, event: string, payload: unknown) {
  if (!io) return;
  io.to(`user:${userId}`).to('role:ADMIN').to('role:COORDINATOR').emit(event, payload);
}

/** Emite a varios usuarios (ej. un profesor y el estudiante afectado). */
export function emitToUsers(userIds: string[], event: string, payload: unknown) {
  if (!io) return;
  const rooms = [...new Set(userIds)].map(id => `user:${id}`);
  io.to(rooms).to('role:ADMIN').to('role:COORDINATOR').emit(event, payload);
}
