import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { router } from '@/app/router';
import { AppProviders } from '@/app/providers';
import { AppErrorBoundary } from '@/app/error-boundary';
import { initTheme } from '@/state/theme.store';
import { useSession } from '@/state/session.store';
import '@/styles/globals.css';

// Applied before the first paint so the window never flashes light then dark.
initTheme();

// Session restore starts immediately, in parallel with React mounting, instead
// of waiting for the first component to request it.
void useSession.getState().bootstrap();

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
