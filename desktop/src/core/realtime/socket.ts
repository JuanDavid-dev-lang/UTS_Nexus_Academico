/**
 * Real-time synchronisation.
 *
 * The backend pushes `sync:update` events over socket.io with a JWT handshake.
 * Instead of the v1 approach - showing a status label and doing nothing with
 * the payload - each event invalidates the matching React Query cache key, so
 * the affected screen refetches and everything else stays untouched.
 */
import { io, type Socket } from 'socket.io-client';
import type { QueryClient } from '@tanstack/react-query';
import { tokenService } from '@/core/auth/token.service';
import { refreshAccessToken } from '@/core/api/http-client';
import { queryKeys } from '@/core/api/query-keys';

export type SyncEntity =
  | 'student'
  | 'subject'
  | 'group'
  | 'grade'
  | 'attendance'
  | 'notification'
  | 'announcement'
  | 'enrollment'
  | 'registration'
  | 'professor';

export type SyncStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

type SyncPayload = { entity?: string; action?: string; id?: string };

/** Which cached queries a change to each entity makes stale. */
const INVALIDATION_MAP: Record<SyncEntity, readonly (readonly unknown[])[]> = {
  student: [queryKeys.students.all, queryKeys.analytics.all],
  subject: [queryKeys.subjects.all, queryKeys.analytics.all],
  group: [queryKeys.groups.all],
  grade: [queryKeys.grades.all, queryKeys.analytics.all],
  attendance: [queryKeys.attendance.all, queryKeys.analytics.all],
  notification: [queryKeys.notifications.all],
  // Sin esta entrada el aviso se guardaba y se emitía el evento, pero ninguna
  // pantalla abierta se enteraba: al docente no le aparecía hasta que recargara.
  announcement: [queryKeys.announcements.all],
  // Matricular cambia también quién sale en la lista de una materia, así que la
  // caché de estudiantes tiene que caer con ella.
  enrollment: [queryKeys.enrollments.all, queryKeys.students.all, queryKeys.analytics.all],
  // El backend ya emitía estas dos, pero no estaban en el mapa: el handler
  // salía por `if (!keys) return` y la pantalla se quedaba con el catálogo o el
  // perfil viejos hasta que el docente recargara a mano.
  registration: [queryKeys.registro.all],
  professor: [queryKeys.auth.all],
};

let socket: Socket | null = null;

export type SyncListener = (status: SyncStatus, detail?: string) => void;

export function connectRealtime(
  serverUrl: string,
  queryClient: QueryClient,
  onStatus: SyncListener,
): () => void {
  disconnectRealtime();

  const token = tokenService.getAccessToken();
  if (!token) {
    onStatus('error', 'Sin sesión activa.');
    return () => undefined;
  }

  onStatus('connecting');

  socket = io(serverUrl, {
    transports: ['websocket'],
    // Función, no objeto: socket.io la invoca en CADA intento de conexión, así
    // que una reconexión posterior a una renovación manda el token vigente. Con
    // `auth: { token }` el token quedaba congelado en el del primer handshake y
    // al expirar el servidor rechazaba todos los reintentos — la sincronización
    // moría en silencio hasta reiniciar la app.
    auth: (cb: (data: Record<string, unknown>) => void) => {
      cb({ token: tokenService.getAccessToken() ?? token });
    },
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    timeout: 8000,
  });

  // Referencia estable a ESTA conexión. La variable de módulo puede apuntar a
  // otra distinta cuando un manejador asíncrono termine.
  const active = socket;

  // Un rechazo de credenciales no se arregla reintentando con lo mismo: hay que
  // renovar primero. Se intenta una sola vez por conexión para no entrar en un
  // bucle de refresco cuando el refresh token también está muerto.
  let refreshAttempted = false;

  active.on('connect', () => {
    refreshAttempted = false;
    onStatus('connected');
  });
  active.on('disconnect', (reason) => onStatus('disconnected', reason));
  active.on('connect_error', (error) => {
    onStatus('error', error.message);
    if (refreshAttempted || !error.message.includes('unauthorized')) return;

    refreshAttempted = true;
    void refreshAccessToken().then((renewed) => {
      // `socket !== active` significa que mientras se renovaba alguien cerró
      // sesión o reconectó: revivir esa conexión dejaría dos sockets vivos.
      if (!renewed || socket !== active) return;
      active.connect();
    });
  });

  active.on('sync:update', (payload: SyncPayload) => {
    const entity = payload?.entity as SyncEntity | undefined;
    if (!entity) return;

    // Las entidades sin pantalla en escritorio (`schedule`, `activity`) caen
    // aquí a propósito: no hay caché que invalidar.
    const keys = INVALIDATION_MAP[entity];
    if (!keys) return;

    for (const queryKey of keys) {
      void queryClient.invalidateQueries({ queryKey: queryKey as unknown[] });
    }
  });

  return disconnectRealtime;
}

export function disconnectRealtime(): void {
  if (!socket) return;
  socket.removeAllListeners();
  socket.disconnect();
  socket = null;
}

export function isRealtimeConnected(): boolean {
  return socket?.connected ?? false;
}
