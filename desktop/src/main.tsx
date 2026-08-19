import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { router } from '@/app/router';
import { AppProviders } from '@/app/providers';
import { AppErrorBoundary } from '@/app/error-boundary';
import { initTheme } from '@/state/theme.store';
import { iniciarTelemetria } from '@/core/telemetry/reporter';
import { useSession } from '@/state/session.store';
import '@/styles/globals.css';

// Applied before the first paint so the window never flashes light then dark.
initTheme();

// Session restore starts immediately, in parallel with React mounting, instead
// of waiting for the first component to request it.
void useSession.getState().bootstrap();

/*
 * Errores globales y promesas rechazadas.
 *
 * Se engancha antes de montar React: un fallo durante el primer renderizado
 * ocurre antes de que ningún componente pueda instalarlo, y es justo el que
 * más interesa. No se desengancha porque vive tanto como la ventana.
 */
iniciarTelemetria();

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root not found');

createRoot(container).render(
  <StrictMode>
    <AppErrorBoundary>
      <AppProviders>
        <RouterProvider router={router} />
      </AppProviders>
    </AppErrorBoundary>
  </StrictMode>,
);
