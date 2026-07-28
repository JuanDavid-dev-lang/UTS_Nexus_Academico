/**
 * Theme state: light, dark or follow the operating system.
 *
 * Applying a theme is a single attribute write on <html>. No stylesheet is
 * rebuilt and no component re-renders - the previous client regenerated the
 * entire Qt stylesheet on every toggle.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const MEDIA_QUERY = '(prefers-color-scheme: dark)';

function systemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia(MEDIA_QUERY).matches ? 'dark' : 'light';
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  return preference === 'system' ? systemTheme() : preference;
}

function applyToDocument(theme: ResolvedTheme): void {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

type ThemeState = {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
  /** Cycles light -> dark -> system, bound to Ctrl+Shift+L. */
  cycle: () => void;
};

export const useTheme = create<ThemeState>()(
  persist(
    (set, get) => ({
      preference: 'system',
      resolved: 'light',

      setPreference(preference) {
        const resolved = resolveTheme(preference);
        applyToDocument(resolved);
        set({ preference, resolved });
      },

      cycle() {
        const order: ThemePreference[] = ['light', 'dark', 'system'];
        const next = order[(order.indexOf(get().preference) + 1) % order.length] ?? 'system';
        get().setPreference(next);
      },
    }),
    {
      name: 'uts.theme',
      // Only the user's choice is persisted; `resolved` is derived at boot.
      partialize: (state) => ({ preference: state.preference }),
      onRehydrateStorage: () => (state) => state?.setPreference(state.preference),
    },
  ),
);

/**
 * Keeps the app in sync when the OS theme changes while it is running.
 * Returns an unsubscribe function.
 */
export function watchSystemTheme(): () => void {
  const media = window.matchMedia(MEDIA_QUERY);
  const handler = () => {
    const { preference, setPreference } = useTheme.getState();
    if (preference === 'system') setPreference('system');
  };
  media.addEventListener('change', handler);
  return () => media.removeEventListener('change', handler);
}

/** Applies the stored theme before React mounts, avoiding a flash of light UI. */
export function initTheme(): void {
  const { preference } = useTheme.getState();
  const resolved = resolveTheme(preference);
  applyToDocument(resolved);
  useTheme.setState({ resolved });
}
