/**
 * Theme state: light, dark or follow the operating system, plus the rest of
 * the appearance — tone, custom colour, colour vision and style.
 *
 * Applying it is attribute and custom-property writes on <html>. No stylesheet
 * is rebuilt and no component re-renders - the previous client regenerated the
 * entire Qt stylesheet on every toggle.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  APARIENCIA_POR_DEFECTO,
  atributosDocumento,
  firmaVisual,
  normalizarApariencia,
  variablesCss,
  type Apariencia,
} from '@/domain/appearance/preferences';

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

function applyToDocument(theme: ResolvedTheme, apariencia: Apariencia): void {
  const raiz = document.documentElement;
  raiz.dataset.theme = theme;
  raiz.style.colorScheme = theme;

  for (const [clave, valor] of Object.entries(atributosDocumento(apariencia))) {
    raiz.dataset[clave] = valor;
  }

  // `variablesCss` devuelve siempre el mismo juego de nombres, así que escribir
  // encima basta: no queda ninguna propiedad de la apariencia anterior.
  for (const [nombre, valor] of Object.entries(variablesCss(apariencia, theme))) {
    raiz.style.setProperty(nombre, valor);
  }
}

type ThemeState = {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  apariencia: Apariencia;
  /** Ver `firmaVisual`: cambia con todo lo que obliga a repintar un gráfico. */
  firma: string;
  setPreference: (preference: ThemePreference) => void;
  /** Cambia uno o varios campos de la apariencia y la aplica de inmediato. */
  setApariencia: (cambios: Partial<Apariencia>) => void;
  /** Vuelve al tono institucional y al estilo de siempre. No toca claro/oscuro. */
  restablecerApariencia: () => void;
  /** Cycles light -> dark -> system, bound to Ctrl+Shift+L. */
  cycle: () => void;
};

export const useTheme = create<ThemeState>()(
  persist(
    (set, get) => ({
      preference: 'system',
      resolved: 'light',
      apariencia: APARIENCIA_POR_DEFECTO,
      firma: firmaVisual(APARIENCIA_POR_DEFECTO, 'light'),

      setPreference(preference) {
        const resolved = resolveTheme(preference);
        const { apariencia } = get();
        applyToDocument(resolved, apariencia);
        set({ preference, resolved, firma: firmaVisual(apariencia, resolved) });
      },

      setApariencia(cambios) {
        const { resolved, apariencia } = get();
        const siguiente = normalizarApariencia({ ...apariencia, ...cambios });
        applyToDocument(resolved, siguiente);
        set({ apariencia: siguiente, firma: firmaVisual(siguiente, resolved) });
      },

      restablecerApariencia() {
        get().setApariencia(APARIENCIA_POR_DEFECTO);
      },

      cycle() {
        const order: ThemePreference[] = ['light', 'dark', 'system'];
        const next = order[(order.indexOf(get().preference) + 1) % order.length] ?? 'system';
        get().setPreference(next);
      },
    }),
    {
      name: 'uts.theme',
      version: 1,
      // Only the user's choices are persisted; `resolved` and `firma` are derived.
      partialize: (state) => ({
        preference: state.preference,
        apariencia: state.apariencia,
      }),
      // La versión 0 solo guardaba `preference`. `migrate` tiene que existir —sin
      // él, zustand descarta lo guardado al cambiar de versión y se perdería el
      // modo elegido—, pero no valida: lo pasa tal cual y `merge` sanea las dos
      // formas. Por eso devuelve `unknown` y no finge un tipo.
      migrate: (guardado: unknown) => guardado,
      merge: (guardado, actual) => {
        const g = (guardado ?? {}) as {
          preference?: unknown;
          apariencia?: unknown;
        };
        const preference: ThemePreference =
          g.preference === 'light' || g.preference === 'dark' ? g.preference : 'system';
        return {
          ...actual,
          preference,
          apariencia: normalizarApariencia(g.apariencia),
        };
      },
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
  const { preference, apariencia } = useTheme.getState();
  const resolved = resolveTheme(preference);
  applyToDocument(resolved, apariencia);
  useTheme.setState({ resolved, firma: firmaVisual(apariencia, resolved) });
}
