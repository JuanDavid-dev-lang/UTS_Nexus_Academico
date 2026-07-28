/**
 * JWT lifecycle.
 *
 * Tokens live in memory while the app runs and in the OS credential vault
 * between runs. They are never written to localStorage, QSettings or any other
 * readable location - that was one of the concrete security holes in v1.
 *
 * This module is deliberately framework-free: no React, no store. The HTTP
 * client and the session store both build on top of it.
 */
import { platform } from '@/core/platform/tauri';

const ACCESS_KEY = 'access_token';
const REFRESH_KEY = 'refresh_token';
const SERVER_KEY = 'api_base_url';

type Tokens = { accessToken: string; refreshToken: string };

let memory: Partial<Tokens> = {};
let hydrated = false;

/** Decoded JWT payload we care about. */
type JwtPayload = {
  sub?: string;
  role?: string;
  studentId?: string;
  exp?: number;
};

/**
 * Reads the payload without verifying the signature.
 *
 * Verification is the server's job - the client only needs the expiry so it can
 * refresh proactively. Never make an authorisation decision on this alone.
 */
export function decodeJwt(token: string): JwtPayload | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
    return JSON.parse(atob(padded)) as JwtPayload;
  } catch {
    return null;
  }
}

/** True when the token expires within `skewSeconds`. */
export function isExpiring(token: string, skewSeconds = 60): boolean {
  const payload = decodeJwt(token);
  if (!payload?.exp) return false;
  return payload.exp * 1000 - Date.now() < skewSeconds * 1000;
}

export const tokenService = {
  /** Loads persisted tokens once per app run. */
  async hydrate(): Promise<Partial<Tokens>> {
    if (hydrated) return memory;
    const [accessToken, refreshToken] = await Promise.all([
      platform.secureStore.get(ACCESS_KEY),
      platform.secureStore.get(REFRESH_KEY),
    ]);
    memory = {
      ...(accessToken ? { accessToken } : {}),
      ...(refreshToken ? { refreshToken } : {}),
    };
    hydrated = true;
    return memory;
  },

  getAccessToken(): string | undefined {
    return memory.accessToken;
  },

  getRefreshToken(): string | undefined {
    return memory.refreshToken;
  },

  async set(tokens: Tokens): Promise<void> {
    memory = tokens;
    hydrated = true;
    await Promise.all([
      platform.secureStore.set(ACCESS_KEY, tokens.accessToken),
      platform.secureStore.set(REFRESH_KEY, tokens.refreshToken),
    ]);
  },

  async clear(): Promise<void> {
    memory = {};
    hydrated = true;
    await Promise.all([
      platform.secureStore.remove(ACCESS_KEY),
      platform.secureStore.remove(REFRESH_KEY),
    ]);
  },

  async getServerUrl(): Promise<string | null> {
    return platform.secureStore.get(SERVER_KEY);
  },

  async setServerUrl(url: string): Promise<void> {
    await platform.secureStore.set(SERVER_KEY, url);
  },

  /** Test seam: resets module state between test cases. */
  __resetForTests(): void {
    memory = {};
    hydrated = false;
  },
};
