import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/core/api/query-keys';
import { notificationRepository } from '@/infrastructure/repositories/insights.repository';
import { isUnread, type Notification } from '@/domain/schemas/insights';
import { useSession } from '@/state/session.store';
import { toast } from '@/state/toast.store';

export function useNotifications() {
  const authenticated = useSession((state) => state.status === 'authenticated');

  return useQuery({
    queryKey: queryKeys.notifications.list(),
    queryFn: () => notificationRepository.list(),
    enabled: authenticated,
    staleTime: 30_000,
  });
}

/**
 * Unread badge count for the sidebar.
 *
 * Reads from the same cache entry as the notifications page, so the badge and
 * the list can never disagree.
 */
export function useUnreadCount(): number {
  const { data } = useNotifications();
  return data?.filter(isUnread).length ?? 0;
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => notificationRepository.markRead(id),

    // Optimistic update: the badge drops the moment the user clicks, instead of
    // waiting for a round trip on an action that practically never fails.
    async onMutate(id) {
      await queryClient.cancelQueries({ queryKey: queryKeys.notifications.list() });
      const previous = queryClient.getQueryData<Notification[]>(queryKeys.notifications.list());

      queryClient.setQueryData<Notification[]>(queryKeys.notifications.list(), (current) =>
        current?.map((notification) =>
          notification._id === id
            ? { ...notification, readAt: new Date().toISOString() }
            : notification,
        ),
      );

      return { previous };
    },

    onError(error, _id, context) {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.notifications.list(), context.previous);
      }
      toast.fromError(error, 'No se pudo marcar como leída');
    },

    onSettled() {
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
    },
  });
}

export function useScanRisks() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (period?: string) => notificationRepository.scanRisks(period),

    onSuccess(result) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.analytics.all });

      toast.success(
        result.created > 0 ? `${result.created} alertas nuevas` : 'Sin alertas nuevas',
        `Se revisaron ${result.scanned} registros académicos.`,
      );
    },

    onError(error) {
      toast.fromError(error, 'No se pudo ejecutar el escaneo de riesgo');
    },
  });
}
