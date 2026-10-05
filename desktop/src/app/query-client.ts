import { QueryCache, QueryClient } from '@tanstack/react-query';
import { toast } from '@/state/toast.store';
import { AppError, toAppError } from '@/core/api/errors';
import { useConectividad } from '@/state/connectivity.store';
import { registrarCliente } from '@/core/offline/cache';
import { RAICES_PERSISTIDAS, VIDA_MAXIMA_CACHE_MS } from '@/domain/offline/persistencia';

/**
 * Builds the query client.
 *
 * The retry policy is the important part: retrying a 403 or a validation error
 * is pure latency for the user, so only genuinely transient failures are retried.
 */
export function createQueryClient(): QueryClient {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        // Data stays fresh for 30s; real-time events invalidate it earlier when
        // something actually changes, so polling is unnecessary.
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        // Sin conexión (`onlineManager`, gobernado por `core/offline/`) las
        // consultas se PAUSAN en vez de fallar: lo que hay en pantalla se
        // queda y, al volver el servidor, se refresca solo.
        networkMode: 'online',
        retry: (failureCount, error) => {
          const appError = error instanceof AppError ? error : toAppError(error);
          return appError.isRetryable && failureCount < 2;
        },
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
      },
      mutations: {
        retry: false,
        // Guardar nunca espera a «estar en línea»: lo que se escribe pasa por
        // la cola de envíos, que decide si sube ahora o después.
        networkMode: 'always',
      },
    },

    // Background refetch failures must not be silent, but they also must not
    // spam: only surface errors for queries that already have data on screen.
    // Sin conexión no se avisa: ya lo dice la barra superior, y un aviso por
    // cada consulta sería ruido encima de un hecho conocido.
    queryCache: new QueryCache({
      onError: (error, query) => {
        if (query.state.data === undefined) return;
        // La precarga en segundo plano es de mejor esfuerzo: no avisa de nada.
        if (query.meta?.silencioso) return;
        if (!useConectividad.getState().online) return;
        toast.fromError(error, 'No se pudo actualizar la información');
      },
    }),
  });

  // Lo que se guarda en disco tiene que poder vivir en memoria lo mismo: una
  // consulta restaurada sin observadores se recogía a los 5 minutos, antes de
  // que el docente llegara a la pantalla que la usa.
  for (const raiz of RAICES_PERSISTIDAS) {
    client.setQueryDefaults([raiz], { gcTime: VIDA_MAXIMA_CACHE_MS });
  }

  return client;
}

/**
 * El cliente de la aplicación. Existe antes de montar React porque la sesión se
 * restaura (y con ella la caché del disco) en paralelo al primer render.
 */
export const queryClient = createQueryClient();
registrarCliente(queryClient);
