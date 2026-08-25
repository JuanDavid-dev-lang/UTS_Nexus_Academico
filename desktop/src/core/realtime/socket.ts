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
import { toast } from '@/state/toast.store';
import { mostrarAvisoNativo } from '@/core/platform/notifications';

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
  | 'professor'
  | 'schedule'
  | 'calendar'
  | 'activity'
  | 'preferences'
  | 'reportTemplate'
  | 'feedback'
  | 'thesisFormat'
  | 'period'
  | 'attendanceCase'
  | 'clientError'
  | 'user';

/**
 * Estado de la sincronización.
 *
 * `reconnecting` se distingue de `connecting` a propósito: la primera conexión
 * y un corte a mitad de sesión no significan lo mismo para quien está
 * trabajando. Con un solo estado, un corte de red se veía igual que el arranque
 * y no había forma de saber si lo que hay en pantalla sigue vivo.
 */
export type SyncStatus =
  | 'disconnected'
  | 'connecting'
  | 'reconnecting'
  | 'connected'
  | 'error';

type SyncPayload = { entity?: string; action?: string; id?: string };

/** Lo que emite el backend en `notification:new`. */
type NotificacionEntrante = {
  _id?: string;
  title?: string;
  message?: string;
  type?: string;
  priority?: 'URGENT' | 'IMPORTANT' | 'INFO' | 'SYSTEM';
  link?: string;
};

/** Which cached queries a change to each entity makes stale. */
export const INVALIDATION_MAP: Record<SyncEntity, readonly (readonly unknown[])[]> = {
  // `coordination` cuelga de casi todo lo académico a propósito: sus tablas son
  // otro corte de las mismas notas y las mismas matrículas, así que dejarla
  // fuera mostraría a coordinación un promedio que ya nadie más ve.
  student: [queryKeys.students.all, queryKeys.analytics.all, queryKeys.coordination.all],
  subject: [queryKeys.subjects.all, queryKeys.analytics.all, queryKeys.coordination.all],
  group: [queryKeys.groups.all, queryKeys.coordination.all],
  grade: [queryKeys.grades.all, queryKeys.analytics.all, queryKeys.coordination.all],
  // La vista previa del reporte muestra asistencia: si cambia una marca, la
  // previa abierta tiene que refrescarse con ella.
  attendance: [
    queryKeys.attendance.all,
    queryKeys.analytics.all,
    queryKeys.reports.all,
    queryKeys.coordination.all,
  ],
  notification: [queryKeys.notifications.all],
  // Sin esta entrada el aviso se guardaba y se emitía el evento, pero ninguna
  // pantalla abierta se enteraba: al docente no le aparecía hasta que recargara.
  announcement: [queryKeys.announcements.all],
  // Matricular cambia también quién sale en la lista de una materia, así que la
  // caché de estudiantes tiene que caer con ella.
  enrollment: [
    queryKeys.enrollments.all,
    queryKeys.students.all,
    queryKeys.analytics.all,
    queryKeys.coordination.all,
  ],
  // El backend ya emitía estas dos, pero no estaban en el mapa: el handler
  // salía por `if (!keys) return` y la pantalla se quedaba con el catálogo o el
  // perfil viejos hasta que el docente recargara a mano.
  registration: [queryKeys.registro.all],
  // El cambio de flag (director de trabajo de grado) tiene que refrescar el
  // perfil propio (gate del menú) y la lista administrativa de docentes.
  professor: [queryKeys.auth.all, queryKeys.profile.all, queryKeys.professors.all],
  // Mover una franja del horario cambia el calendario entero: las clases que
  // el servidor expande a ocurrencias salen de ahí. Antes `schedule` no estaba
  // en el mapa y el evento se descartaba en el `if (!keys) return`.
  schedule: [queryKeys.schedules.all, queryKeys.agenda.all],
  calendar: [queryKeys.agenda.all],
  // Una entrega aparece en la agenda ADEMÁS de en su propia pantalla. Antes
  // solo caía la agenda, así que crear una actividad desde otro equipo no la
  // hacía aparecer en el listado de actividades hasta recargar.
  activity: [queryKeys.activities.all, queryKeys.agenda.all],
  // Cambiar la antelación en un dispositivo tiene que reflejarse en el otro.
  preferences: [queryKeys.notifications.all],
  // La plantilla cambia lo que muestran el editor y la vista previa abiertos
  // en otras sesiones de administración.
  reportTemplate: [queryKeys.reports.all],
  // Una sugerencia nueva aparece en la bandeja del admin; un cambio de estado,
  // en la lista del docente que la envió.
  feedback: [queryKeys.feedback.all],
  thesisFormat: [queryKeys.thesisFormats.all],
  /**
   * Cerrar un periodo cambia mucho más que su propia pantalla: bloquea las
   * escrituras de notas, asistencia y matrículas, así que los formularios
   * abiertos tienen que enterarse antes de que alguien intente guardar y
   * reciba un 409 que no espera.
   */
  period: [
    queryKeys.periods.all,
    queryKeys.grades.all,
    queryKeys.attendance.all,
    queryKeys.enrollments.all,
    queryKeys.analytics.all,
  ],
  // Un caso nuevo aparece en la pantalla de riesgo y en el historial del
  // estudiante, que es donde el docente lo va a mirar.
  attendanceCase: [queryKeys.attendanceCases.all, queryKeys.analytics.all, queryKeys.timeline.all],
  clientError: [queryKeys.telemetry.all, queryKeys.system.all],
  /**
   * Cambiarle el rol o los programas a alguien cambia lo que esa cuenta ve.
   * Cae la pantalla de personal, la sesión propia (el menú se dibuja con el rol)
   * y el panorama de coordinación, que es justo lo que el alcance acota.
   */
  user: [
    queryKeys.users.all,
    queryKeys.auth.all,
    queryKeys.profile.all,
    queryKeys.coordination.all,
  ],
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

  // El manager de socket.io es quien sabe de reintentos; el socket solo ve el
  // resultado. Sin esto, una reconexión en curso se mostraba como 'sin
  // conexión' hasta que terminaba.
  active.io.on('reconnect_attempt', (intento: number) => {
    onStatus('reconnecting', `Intento ${intento}`);
  });
  active.io.on('reconnect', () => onStatus('connected'));
  active.io.on('reconnect_failed', () => {
    onStatus('error', 'No se pudo restablecer la conexión.');
  });

  active.on('sync:update', (payload: SyncPayload) => {
    const entity = payload?.entity as SyncEntity | undefined;
    if (!entity) return;

    // Una entidad sin entrada en el mapa cae aquí a propósito: no hay caché
    // que invalidar y recargarlo todo por si acaso haría parpadear pantallas
    // que no cambiaron.
    const keys = INVALIDATION_MAP[entity];
    if (!keys) return;

    for (const queryKey of keys) {
      void queryClient.invalidateQueries({ queryKey: queryKey as unknown[] });
    }
  });

  /**
   * Notificación nueva dirigida a este usuario.
   *
   * Va por un evento propio y no por `sync:update` porque son dos cosas
   * distintas: `sync:update` dice "esta caché caducó" y este dice "avísale". La
   * bandeja se invalida igualmente para que el contador del menú suba sin
   * esperar al siguiente refresco.
   */
  active.on('notification:new', (payload: NotificacionEntrante) => {
    if (!payload?.title) return;

    void queryClient.invalidateQueries({ queryKey: [...queryKeys.notifications.all] });
    // Un recordatorio de clase cambia lo que la agenda considera "en curso".
    if (payload.type === 'CLASS' || payload.type === 'SCHEDULE') {
      void queryClient.invalidateQueries({ queryKey: [...queryKeys.agenda.all] });
    }

    const tono = payload.priority === 'URGENT' ? 'error' : payload.priority === 'IMPORTANT' ? 'warning' : 'info';
    toast[tono](payload.title, payload.message);

    // El aviso del sistema es lo que llega cuando la ventana está detrás de
    // otra aplicación, que es justo cuando un recordatorio sirve de algo.
    void mostrarAvisoNativo({ title: payload.title, body: payload.message ?? '' });
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
