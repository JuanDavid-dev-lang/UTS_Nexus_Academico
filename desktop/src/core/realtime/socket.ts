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
import { queryKeys } from '@/core/api/query-keys';

export type SyncEntity =
  | 'student'
  | 'subject'
  | 'group'
  | 'grade'
  | 'attendance'
  | 'notification'
  | 'enrollment';

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
  // Matricular cambia también quién sale en la lista de una materia, así que la
  // caché de estudiantes tiene que caer con ella.
  enrollment: [queryKeys.enrollments.all, queryKeys.students.all, queryKeys.analytics.all],
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
    auth: { token },
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    timeout: 8000,
  });

  socket.on('connect', () => onStatus('connected'));
  socket.on('disconnect', (reason) => onStatus('disconnected', reason));
  socket.on('connect_error', (error) => onStatus('error', error.message));

  socket.on('sync:update', (payload: SyncPayload) => {
    const entity = payload?.entity as SyncEntity | undefined;
    if (!entity) return;

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
