import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/core/api/query-keys';
import { attendanceRepository } from '@/infrastructure/repositories/academic.repository';
import type { Scope } from '@/domain/repositories/ports';
import { toast } from '@/state/toast.store';

export function useAttendance(scope: Scope, enabled = true) {
  return useQuery({
    queryKey: queryKeys.attendance.list(scope),
    queryFn: () => attendanceRepository.list(scope),
    enabled,
  });
}

export function useMarkAttendance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: Parameters<typeof attendanceRepository.mark>[0]) =>
      attendanceRepository.mark(input),

    onSuccess() {
      void queryClient.invalidateQueries({ queryKey: queryKeys.attendance.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.analytics.all });
    },

    onError(error) {
      toast.fromError(error, 'No se pudo registrar la asistencia');
    },
  });
}
