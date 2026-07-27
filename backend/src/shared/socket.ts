import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import { env } from './env.js';
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
    cors: { origin: env.CLIENT_ORIGIN, credentials: true },
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

/** Broadcast global — usar solo para eventos no sensibles. */
export function emitSync(event: string, payload: unknown) {
  io?.emit(event, payload);
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
