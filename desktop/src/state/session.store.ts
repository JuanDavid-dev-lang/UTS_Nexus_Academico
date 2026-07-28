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
import { DEFAULT_SERVER_URL, normalizeServerUrl } from '@/core/config/env';
import { toAppError } from '@/core/api/errors';
import type { User } from '@/domain/schemas/auth';

type SessionStatus = 'booting' | 'anonymous' | 'authenticated';

type SessionState = {
  status: SessionStatus;
  user: User | null;
  serverUrl: string;

  /** Restores a previous session at startup, if the stored tokens still work. */
  bootstrap: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  changeServerUrl: (url: string) => Promise<void>;
  /** Called when the HTTP layer detects an unrecoverable 401. */
  expire: () => void;
};

export const useSession = create<SessionState>((set, get) => ({
  status: 'booting',
  user: null,
  serverUrl: DEFAULT_SERVER_URL,

  async bootstrap() {
    const storedServer = await tokenService.getServerUrl();
    const serverUrl = normalizeServerUrl(storedServer ?? DEFAULT_SERVER_URL);
    setServerUrl(serverUrl);
    set({ serverUrl });

    await tokenService.hydrate();
    if (!tokenService.getAccessToken()) {
      set({ status: 'anonymous', user: null });
      return;
    }

    try {
      // /auth/me both validates the stored token and refreshes the user data;
      // a 401 here is transparently handled by the HTTP client's refresh flow.
      const user = await authRepository.me();
      set({ status: 'authenticated', user });
    } catch {
      await tokenService.clear();
      set({ status: 'anonymous', user: null });
    }
  },

  async login(email: string, password: string) {
    try {
      const { user, accessToken, refreshToken } = await authRepository.login({ email, password });
      await tokenService.set({ accessToken, refreshToken });
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

  expire() {
    set({ status: 'anonymous', user: null });
  },
}));

export const useCurrentUser = () => useSession((state) => state.user);
export const useUserRole = () => useSession((state) => state.user?.role);
