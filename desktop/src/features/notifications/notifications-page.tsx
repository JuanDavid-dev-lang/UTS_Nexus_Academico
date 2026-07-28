import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  BookOpen,
  CalendarClock,
  CheckCheck,
  GraduationCap,
  ScanSearch,
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
  useMarkNotificationRead,
  useNotifications,
  useScanRisks,
} from '@/features/notifications/hooks/use-notifications';
import { isUnread, type Notification, type NotificationType } from '@/domain/schemas/insights';
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
  EXAM: { icon: GraduationCap, tone: 'text-info bg-info-soft', label: 'Examen' },
  DEADLINE: { icon: CalendarClock, tone: 'text-warning bg-warning-soft', label: 'Fecha límite' },
};

export default function NotificationsPage() {
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const role = useUserRole();
  const canScan = can(role, 'notifications.scan');

  const notifications = useNotifications();
  const markRead = useMarkNotificationRead();
  const scanRisks = useScanRisks();

  const items = notifications.data ?? [];
  const unreadCount = useMemo(() => items.filter(isUnread).length, [items]);

  const filtered = useMemo(
    () => (filter === 'unread' ? items.filter(isUnread) : items),
    [items, filter],
  );

  function markAllRead() {
    for (const notification of items.filter(isUnread)) {
      markRead.mutate(notification._id);
    }
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
              <Button variant="secondary" onClick={markAllRead}>
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

      <Tabs value={filter} onValueChange={(value) => setFilter(value as 'all' | 'unread')}>
        <TabsList>
          <TabsTrigger value="all">
            Todas <Badge>{items.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="unread">
            Sin leer {unreadCount > 0 ? <Badge tone="danger">{unreadCount}</Badge> : null}
          </TabsTrigger>
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
            title={filter === 'unread' ? 'Todo al día' : 'Sin notificaciones'}
            message={
              filter === 'unread'
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
              onMarkRead={() => markRead.mutate(notification._id)}
            />
          ))}
        </ul>
      )}
    </PageContainer>
  );
}

function NotificationRow({
  notification,
  onMarkRead,
}: {
  notification: Notification;
  onMarkRead: () => void;
}) {
  const presentation = TYPE_PRESENTATION[notification.type];
  const unread = isUnread(notification);

  return (
    <li
      className={cn(
        'surface-card flex items-start gap-3 p-4 transition-colors',
        unread && 'border-primary/30 bg-primary/[0.04]',
      )}
    >
      <span className={cn('grid size-9 shrink-0 place-items-center rounded-xl', presentation.tone)}>
        <presentation.icon className="size-4" aria-hidden />
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-text">{notification.title}</h3>
          <Badge>{presentation.label}</Badge>
          {unread ? <span className="size-1.5 rounded-full bg-primary" aria-label="Sin leer" /> : null}
        </div>

        <p className="text-sm leading-relaxed text-muted" data-selectable>
          {notification.message}
        </p>

        <span className="text-[11px] text-muted">{formatRelative(notification.createdAt)}</span>
      </div>

      {unread ? (
        <Button variant="ghost" size="sm" onClick={onMarkRead}>
          Marcar leída
        </Button>
      ) : null}
    </li>
  );
}
