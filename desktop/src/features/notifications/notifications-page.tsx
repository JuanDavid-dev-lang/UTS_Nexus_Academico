import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Bell,
  BookOpen,
  CalendarClock,
  CalendarDays,
  CheckCheck,
  GraduationCap,
  Megaphone,
  ScanSearch,
  Trash2,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  PageContainer,
  PageHeader,
  SkeletonList,
  Tabs,
  TabsList,
  TabsTrigger,
} from '@/shared/ui';
import {
  useDeleteNotification,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  useScanRisks,
} from '@/features/notifications/hooks/use-notifications';
import {
  isUnread,
  type Notification,
  type NotificationPriority,
  type NotificationType,
} from '@/domain/schemas/insights';
import { formatRelative } from '@/shared/lib/format';
import { useUserRole } from '@/state/session.store';
import { can } from '@/core/auth/permissions';
import { cn } from '@/shared/lib/cn';

const TYPE_PRESENTATION: Record<NotificationType, { icon: typeof Bell; tone: string; label: string }> = {
  RISK: { icon: AlertTriangle, tone: 'text-danger bg-danger-soft', label: 'Riesgo' },
  GRADE: { icon: GraduationCap, tone: 'text-primary bg-primary/10', label: 'Notas' },
  ATTENDANCE: { icon: CalendarClock, tone: 'text-warning bg-warning-soft', label: 'Asistencia' },
  CLASS: { icon: BookOpen, tone: 'text-info bg-info-soft', label: 'Clase' },
  ACTIVITY: { icon: Bell, tone: 'text-muted bg-surface-alt', label: 'Actividad' },
  EXAM: { icon: GraduationCap, tone: 'text-danger bg-danger-soft', label: 'Evaluación' },
  DEADLINE: { icon: CalendarClock, tone: 'text-warning bg-warning-soft', label: 'Fecha límite' },
  EVENT: { icon: CalendarDays, tone: 'text-info bg-info-soft', label: 'Evento' },
  REMINDER: { icon: CalendarClock, tone: 'text-muted bg-surface-alt', label: 'Recordatorio' },
  SCHEDULE: { icon: CalendarDays, tone: 'text-primary bg-primary/10', label: 'Horario' },
  SISTEMA: { icon: Megaphone, tone: 'text-muted bg-surface-alt', label: 'Sistema' },
};

const PRIORITY_PRESENTATION: Record<NotificationPriority, { label: string; tone: 'danger' | 'warning' | 'neutral' }> = {
  URGENT: { label: 'Urgente', tone: 'danger' },
  IMPORTANT: { label: 'Importante', tone: 'warning' },
  INFO: { label: 'Informativa', tone: 'neutral' },
  SYSTEM: { label: 'Sistema', tone: 'neutral' },
};

type Filtro = 'all' | 'unread' | 'URGENT' | 'IMPORTANT' | 'INFO' | 'SYSTEM';

const FILTROS: { valor: Filtro; etiqueta: string }[] = [
  { valor: 'all', etiqueta: 'Todas' },
  { valor: 'unread', etiqueta: 'Sin leer' },
  { valor: 'URGENT', etiqueta: 'Urgentes' },
  { valor: 'IMPORTANT', etiqueta: 'Importantes' },
  { valor: 'INFO', etiqueta: 'Informativas' },
  { valor: 'SYSTEM', etiqueta: 'Sistema' },
];

/**
 * Centro de notificaciones.
 *
 * Además de listar, lleva a donde apunta cada aviso: una alerta de riesgo abre
 * al estudiante y un recordatorio de clase abre esa clase en la agenda. Un
 * aviso que no lleva a ninguna parte obliga a repetir a mano la búsqueda que el
 * propio aviso ya había hecho.
 */
export default function NotificationsPage() {
  const [filtro, setFiltro] = useState<Filtro>('all');

  const role = useUserRole();
  const canScan = can(role, 'notifications.scan');
  const navigate = useNavigate();

  const notifications = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const remove = useDeleteNotification();
  const scanRisks = useScanRisks();

  const items = notifications.data ?? [];
  const unreadCount = useMemo(() => items.filter(isUnread).length, [items]);

  const filtered = useMemo(() => {
    if (filtro === 'all') return items;
    if (filtro === 'unread') return items.filter(isUnread);
    return items.filter((notification) => notification.priority === filtro);
  }, [items, filtro]);

  /** Abre lo que la notificación referencia y la marca leída de paso. */
  function abrir(notification: Notification) {
    if (isUnread(notification)) markRead.mutate(notification._id);
    // Solo rutas internas: una notificación no puede sacar al docente de la
    // aplicación hacia una dirección que alguien haya podido escribir.
    if (notification.link.startsWith('/')) navigate(notification.link);
  }

  return (
    <PageContainer>
      <PageHeader
        title="Notificaciones"
        subtitle={
          unreadCount > 0
            ? `${unreadCount} sin leer de ${items.length}`
            : `${items.length} notificaciones`
        }
        actions={
          <div className="flex gap-2">
            {unreadCount > 0 ? (
              <Button
                variant="secondary"
                onClick={() => markAllRead.mutate()}
                loading={markAllRead.isPending}
              >
                <CheckCheck aria-hidden />
                Marcar todas leídas
              </Button>
            ) : null}
            {canScan ? (
              <Button
                variant="primary"
                onClick={() => scanRisks.mutate(undefined)}
                loading={scanRisks.isPending}
              >
                <ScanSearch aria-hidden />
                Escanear riesgo
              </Button>
            ) : null}
          </div>
        }
      />

      <Tabs value={filtro} onValueChange={(valor) => setFiltro(valor as Filtro)}>
        <TabsList>
          {FILTROS.map((opcion) => {
            const cuantas =
              opcion.valor === 'all'
                ? items.length
                : opcion.valor === 'unread'
                  ? unreadCount
                  : items.filter((item) => item.priority === opcion.valor).length;

            return (
              <TabsTrigger key={opcion.valor} value={opcion.valor}>
                {opcion.etiqueta}
                {cuantas > 0 ? (
                  <Badge tone={opcion.valor === 'URGENT' ? 'danger' : undefined}>{cuantas}</Badge>
                ) : null}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>

      {notifications.isPending ? (
        <SkeletonList rows={6} />
      ) : notifications.isError ? (
        <Card>
          <ErrorState error={notifications.error} onRetry={() => void notifications.refetch()} />
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState
            title={filtro === 'unread' ? 'Todo al día' : 'Sin notificaciones'}
            message={
              filtro === 'unread'
                ? 'No tienes notificaciones pendientes por leer.'
                : 'Cuando el sistema detecte alertas académicas, aparecerán aquí.'
            }
          />
        </Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {filtered.map((notification) => (
            <NotificationRow
              key={notification._id}
              notification={notification}
              onOpen={() => abrir(notification)}
              onMarkRead={() => markRead.mutate(notification._id)}
              onDelete={() => remove.mutate(notification._id)}
            />
          ))}
        </ul>
      )}
    </PageContainer>
  );
}

function NotificationRow({
  notification,
  onOpen,
  onMarkRead,
  onDelete,
}: {
  notification: Notification;
  onOpen: () => void;
  onMarkRead: () => void;
  onDelete: () => void;
}) {
  const presentation = TYPE_PRESENTATION[notification.type];
  const prioridad = PRIORITY_PRESENTATION[notification.priority];
  const unread = isUnread(notification);
  const navegable = notification.link.startsWith('/');

  return (
    <li
      className={cn(
        'surface-card flex items-start gap-3 p-4 transition-colors',
        unread && 'border-primary/30 bg-primary/[0.04]',
        notification.priority === 'URGENT' && 'border-danger/40',
      )}
    >
      <span className={cn('grid size-9 shrink-0 place-items-center rounded-xl', presentation.tone)}>
        <presentation.icon className="size-4" aria-hidden />
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-body font-semibold text-text">{notification.title}</h3>
          <Badge>{presentation.label}</Badge>
          {notification.priority !== 'INFO' ? (
            <Badge tone={prioridad.tone === 'neutral' ? undefined : prioridad.tone}>{prioridad.label}</Badge>
          ) : null}
          {unread ? <span className="size-1.5 rounded-full bg-primary" aria-label="Sin leer" /> : null}
        </div>

        <p className="text-body leading-relaxed text-muted" data-selectable>
          {notification.message}
        </p>

        <span className="text-caption text-muted">{formatRelative(notification.createdAt)}</span>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {navegable ? (
          <Button variant="ghost" size="sm" onClick={onOpen}>
            Abrir
          </Button>
        ) : null}
        {unread ? (
          <Button variant="ghost" size="sm" onClick={onMarkRead}>
            Marcar leída
          </Button>
        ) : null}
        <Button variant="ghost" size="icon" onClick={onDelete} aria-label="Eliminar notificación">
          <Trash2 className="text-muted" aria-hidden />
        </Button>
      </div>
    </li>
  );
}
