import { useEffect } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/shared/ui/primitives';
import { Toaster } from '@/shared/ui/toaster';
import { toast } from '@/state/toast.store';
import { onSessionExpired } from '@/core/api/http-client';
import { useSession } from '@/state/session.store';
import { useSync } from '@/state/sync.store';
import { connectRealtime } from '@/core/realtime/socket';
import { watchSystemTheme } from '@/state/theme.store';
import { UpdatePrompt } from '@/features/updates/update-prompt';
import { queryClient } from '@/app/query-client';
import { iniciarModoSinConexion } from '@/core/offline/coordinador';
import { iniciarPersistencia } from '@/core/offline/cache';
import { outbox } from '@/core/offline/outbox';
import { reiniciarPrecarga } from '@/core/offline/precarga';

export function AppProviders({ children }: { children: React.ReactNode }) {
  const status = useSession((state) => state.status);
  const serverUrl = useSession((state) => state.serverUrl);
  const userId = useSession((state) => state.user?.id);
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
    [expire],
  );

  useEffect(() => watchSystemTheme(), []);

  // Conectividad y envío de lo pendiente: viven mientras viva la ventana.
  useEffect(() => iniciarModoSinConexion(), []);

  // La cola y la caché del disco son de UN usuario: se cargan al entrar y se
  // sueltan al salir. La cola se conserva en disco; la caché se borra aparte
  // (ver `session.store.ts`).
  useEffect(() => {
    if (status !== 'authenticated' || !userId) return;
    void outbox.cargarUsuario(userId);
    const detenerPersistencia = iniciarPersistencia(userId);
    return () => {
      detenerPersistencia();
      outbox.descargar();
      reiniciarPrecarga();
    };
  }, [status, userId]);

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
  }, [status, serverUrl, setSyncStatus, markSyncEvent]);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={400} skipDelayDuration={300}>
        {children}
        {/* Fuera del router: la versión nueva se avisa también en el login, que
            es donde se queda quien no puede entrar por culpa de la vieja. */}
        <UpdatePrompt />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
