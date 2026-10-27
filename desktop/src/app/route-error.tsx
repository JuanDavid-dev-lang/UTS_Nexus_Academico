import { useEffect } from 'react';
import { isRouteErrorResponse, useNavigate, useRouteError } from 'react-router-dom';
import { reportarError } from '@/core/telemetry/reporter';
import { recargarSiFaltaVersion } from '@/core/platform/version-nueva';
import { PantallaDeError } from '@/app/error-boundary';

/**
 * `errorElement` del enrutador.
 *
 * Con `createBrowserRouter`, un fallo dentro de una ruta lo atrapa React
 * Router y no llega a `AppErrorBoundary`. Sin esto se pintaba su página por
 * defecto —«Unexpected Application Error!» en inglés, con la pila— y el fallo
 * no se reportaba. También es donde cae el trozo de una versión anterior al
 * abrir una pantalla tras un despliegue.
 */
export function RouteError() {
  const error = useRouteError();
  const navigate = useNavigate();

  useEffect(() => {
    if (recargarSiFaltaVersion(error)) return;
    reportarError(error instanceof Error ? error : new Error(mensajeDe(error)), {
      categoria: 'render',
      contexto: 'errorElement del enrutador',
    });
  }, [error]);

  return <PantallaDeError mensaje={mensajeDe(error)} onVolver={() => navigate(-1)} />;
}

function mensajeDe(error: unknown): string {
  if (isRouteErrorResponse(error)) return `${error.status} ${error.statusText}`;
  if (error instanceof Error) return error.message;
  return String(error);
}
