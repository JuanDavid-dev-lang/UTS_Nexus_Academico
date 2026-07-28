import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/core/api/query-keys';
import { analyticsRepository } from '@/infrastructure/repositories/insights.repository';

export function useDashboard() {
  return useQuery({
    queryKey: queryKeys.analytics.dashboard(),
    queryFn: () => analyticsRepository.dashboard(),
  });
}

export function useRisks() {
  return useQuery({
    queryKey: queryKeys.analytics.risks(),
    queryFn: () => analyticsRepository.risks(),
  });
}
