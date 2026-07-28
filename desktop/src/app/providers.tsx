import { useEffect, useState } from 'react';
import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/shared/ui/primitives';
import { Toaster } from '@/shared/ui/toaster';
import { toast } from '@/state/toast.store';
import { AppError, toAppError } from '@/core/api/errors';
import { onSessionExpired } from '@/core/api/http-client';
import { useSession } from '@/state/session.store';
import { useSync } from '@/state/sync.store';
import { connectRealtime } from '@/core/realtime/socket';
import { watchSystemTheme } from '@/state/theme.store';

/**
 * Builds the query client.
 *
 * The retry policy is the important part: retrying a 403 or a validation error
 * is pure latency for the user, so only genuinely transient failures are retried.
 */
function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Data stays fresh for 30s; real-time events invalidate it earlier when
        // something actually changes, so polling is unnecessary.
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          const appError = error instanceof AppError ? error : toAppError(error);
          return appError.isRetryable && failureCount < 2;
        },
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
      },
      mutations: {
        retry: false,
      },
    },

    // Background refetch failures must not be silent, but they also must not
    // spam: only surface errors for queries that already have data on screen.
    queryCache: new QueryCache({
      onError: (error, query) => {
        if (query.state.data !== undefined) {
          toast.fromError(error, 'No se pudo actualizar la información');
        }
      },
    }),
  });
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(createQueryClient);
  const status = useSession((state) => state.status);
  const serverUrl = useSession((state) => state.serverUrl);
  const expire = useSession((state) => state.expire);
  const setSyncStatus = useSync((state) => state.set);
  const markSyncEvent = useSync((state) => state.markEvent);

  // An unrecoverable 401 clears the cache and sends the user back to login.
  useEffect(
    () =>
      onSessionExpired(() => {
        expire();
        queryClient.clear();
        toast.warning('Sesión expirada', 'Vuelve a iniciar sesión para continuar.');
      }),
    [expire, queryClient],
  );

  useEffect(() => watchSystemTheme(), []);

  // Real-time sync only makes sense once authenticated.
  useEffect(() => {
    if (status !== 'authenticated') {
      setSyncStatus('disconnected');
      return;
    }

    return connectRealtime(serverUrl, queryClient, (syncStatus, detail) => {
      setSyncStatus(syncStatus, detail);
      if (syncStatus === 'connected') markSyncEvent();
    });
  }, [status, serverUrl, queryClient, setSyncStatus, markSyncEvent]);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={400} skipDelayDuration={300}>
        {children}
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
