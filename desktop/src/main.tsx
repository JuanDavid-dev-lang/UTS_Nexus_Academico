import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { router } from '@/app/router';
import { AppProviders } from '@/app/providers';
import { AppErrorBoundary } from '@/app/error-boundary';
import { initTheme } from '@/state/theme.store';
import { iniciarTelemetria } from '@/core/telemetry/reporter';
import { useSession } from '@/state/session.store';
import { iniciarMantenimientoDeSesion } from '@/core/auth/keep-alive';
import { iniciarPantallaCompleta } from '@/core/platform/pantalla-completa';
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

// La sesión se renueva sola una vez al día mientras la app siga abierta, también
// en la bandeja: sin esto, semanas sin abrirla la dejaban caducar.
iniciarMantenimientoDeSesion();

// El atajo de pantalla completa (F11, ⌃⌘F en macOS) y la recordada del último uso.
iniciarPantallaCompleta();

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
