/**
 * Session state.
 *
 * Holds the authenticated user and the server address. Tokens deliberately do
 * NOT live here: React state is inspectable from the devtools console, so the
 * credential vault stays the only place they exist (see token.service.ts).
 */
import { create } from 'zustand';
import { authRepository } from '@/infrastructure/repositories/auth.repository';
import { tokenService } from '@/core/auth/token.service';
import { setServerUrl } from '@/core/api/http-client';
import { DEFAULT_SERVER_URL, normalizeServerUrl, resolverServidorInicial } from '@/core/config/env';
import { toAppError } from '@/core/api/errors';
import { toast } from '@/state/toast.store';
import type { User } from '@/domain/schemas/auth';

/**
 * `unreachable`: there is a saved session but the server did not answer at
 * startup. The tokens are kept; the app shows a screen to retry instead of the
 * login form. Before this state existed, starting the app with the server
 * stopped or still waking up erased the session, and every such start ended
 * at the login screen.
 */
type SessionStatus = 'booting' | 'anonymous' | 'authenticated' | 'unreachable';

type SessionState = {
  status: SessionStatus;
  user: User | null;
  serverUrl: string;

  /** Restores a previous session at startup, if the stored tokens still work. */
  bootstrap: () => Promise<void>;
  /** Tries the saved session again after `unreachable`. */
  reconnect: () => Promise<void>;
  /** Drops the saved session without asking the server: it did not answer. */
  forget: () => Promise<void>;
  /**
   * `recordar`: guardar la sesión en el almacén del sistema para que cerrar la
   * aplicación no la termine (15 días sin uso, solo en este equipo). Sin
   * marcar, la sesión vive lo que la ventana.
   */
  login: (email: string, password: string, recordar?: boolean) => Promise<void>;
  logout: () => Promise<void>;
  changeServerUrl: (url: string) => Promise<void>;
  /**
   * Actualiza los datos del usuario en memoria tras editar el perfil.
   *
   * La barra superior y el menú de sesión leen de aquí, no de la consulta del
   * perfil: sin esto, cambiar el nombre o la foto se veía en Ajustes y en
   * ningún otro sitio hasta reiniciar.
   */
  setUser: (user: User) => void;
  /** Called when the HTTP layer detects an unrecoverable 401. */
  expire: () => void;
};

export const useSession = create<SessionState>((set, get) => ({
  status: 'booting',
  user: null,
  serverUrl: DEFAULT_SERVER_URL,

  async bootstrap() {
    const storedServer = await tokenService.getServerUrl();
    const { serverUrl, migrado } = resolverServidorInicial(storedServer);
    setServerUrl(serverUrl);
    set({ serverUrl });

    if (migrado) {
      // Se reescribe el valor guardado para no repetir la migración en cada
      // arranque, y se avisa: cambiarle a alguien la dirección del servidor en
      // silencio es la clase de cosa que después nadie sabe explicar.
      await tokenService.setServerUrl(serverUrl);
      toast.info(
        'Servidor actualizado',
        `La versión anterior apuntaba a tu equipo. Ahora usa ${serverUrl}; puedes cambiarlo en Configuración.`,
      );
    }

    await tokenService.hydrate();
    if (!tokenService.getAccessToken()) {
      set({ status: 'anonymous', user: null });
      return;
    }

    await get().reconnect();
  },

  async reconnect() {
    // Reintentando desde `unreachable` la pantalla se queda: volver a la de
    // arranque cada quince segundos sería un parpadeo sin información.
    if (get().status !== 'unreachable') set({ status: 'booting' });
    try {
      // /auth/me both validates the stored token and refreshes the user data;
      // a 401 here is transparently handled by the HTTP client's refresh flow.
      const user = await authRepository.me();
      set({ status: 'authenticated', user });
    } catch (error) {
      // Only the server saying the session is invalid ends it. No answer at
      // all —stopped, waking up, no network— says nothing about the tokens.
      if (toAppError(error).isRetryable) {
        set({ status: 'unreachable', user: null });
        return;
      }
      await tokenService.clear();
      set({ status: 'anonymous', user: null });
    }
  },

  async forget() {
    await tokenService.clear();
    set({ status: 'anonymous', user: null });
  },

  async login(email: string, password: string, recordar = true) {
    try {
      const { user, accessToken, refreshToken } = await authRepository.login({ email, password });
      await tokenService.set({ accessToken, refreshToken }, { persistir: recordar });
      await tokenService.setServerUrl(get().serverUrl);
      set({ status: 'authenticated', user });
    } catch (error) {
      throw toAppError(error);
    }
  },

  async logout() {
    await authRepository.logout();
    set({ status: 'anonymous', user: null });
  },

  async changeServerUrl(url: string) {
    const serverUrl = normalizeServerUrl(url);
    setServerUrl(serverUrl);
    await tokenService.setServerUrl(serverUrl);
    set({ serverUrl });
  },

  setUser(user) {
    set({ user });
  },

  expire() {
    set({ status: 'anonymous', user: null });
  },
}));

export const useCurrentUser = () => useSession((state) => state.user);
export const useUserRole = () => useSession((state) => state.user?.role);
