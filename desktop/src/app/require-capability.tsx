import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { can, type Capability } from '@/core/auth/permissions';
import { useUserRole } from '@/state/session.store';

/**
 * La misma capacidad que pide el menú, también en la ruta.
 *
 * El menú no ofrece lo que el rol no puede usar, pero una URL escrita a mano o
 * un enlace de una notificación abrían la pantalla igual, y la pantalla se
 * llenaba de 403. El servidor es la autoridad; esto evita enseñar una pantalla
 * que no va a funcionar.
 */
export function Con({ capacidad, children }: { capacidad: Capability; children: ReactNode }) {
  const role = useUserRole();
  if (!can(role, capacidad)) return <Navigate to="/" replace />;
  return <>{children}</>;
}
