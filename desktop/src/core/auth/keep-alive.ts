import { refreshAccessToken } from '@/core/api/http-client';
import { decodeJwt, tokenService } from '@/core/auth/token.service';
import { debeRenovarSesion } from '@/domain/session/keep-alive';
import { useSession } from '@/state/session.store';

/** Cada hora se mira si toca; renovar de verdad ocurre como mucho una vez al día. */
const INTERVALO_MS = 60 * 60 * 1000;

function renovarSiToca(): void {
  if (useSession.getState().status !== 'authenticated') return;
  const token = tokenService.getRefreshToken();
  if (!token || !debeRenovarSesion(decodeJwt(token), Date.now())) return;
  // Mismo single-flight que el 401: nunca compite con una renovación en curso,
  // que con la rotación revocaría la familia entera de sesiones.
  void refreshAccessToken();
}

/**
 * Mantiene la sesión viva mientras la aplicación esté abierta, también oculta
 * en la bandeja. Se arranca una vez en `main.tsx` y vive lo que la ventana.
 */
export function iniciarMantenimientoDeSesion(): () => void {
  const intervalo = window.setInterval(renovarSiToca, INTERVALO_MS);
  window.addEventListener('focus', renovarSiToca);
  const dejarDeEscuchar = useSession.subscribe((estado, anterior) => {
    if (estado.status === 'authenticated' && anterior.status !== 'authenticated') renovarSiToca();
  });
  return () => {
    window.clearInterval(intervalo);
    window.removeEventListener('focus', renovarSiToca);
    dejarDeEscuchar();
  };
}
