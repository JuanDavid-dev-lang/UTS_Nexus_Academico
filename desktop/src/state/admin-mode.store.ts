import { create } from 'zustand';
import { useUserRole } from './session.store';

const STORAGE_KEY = 'uts.admin_mode_enabled';

type AdminModeState = {
  adminMode: boolean;
  setAdminMode: (enabled: boolean) => void;
  toggleAdminMode: () => void;
};

export const useAdminModeStore = create<AdminModeState>((set) => ({
  adminMode: localStorage.getItem(STORAGE_KEY) !== 'false',
  setAdminMode: (enabled: boolean) => {
    localStorage.setItem(STORAGE_KEY, String(enabled));
    set({ adminMode: enabled });
  },
  toggleAdminMode: () => {
    set((state) => {
      const next = !state.adminMode;
      localStorage.setItem(STORAGE_KEY, String(next));
      return { adminMode: next };
    });
  },
}));

/**
 * Devuelve `true` solo si el usuario actual es ADMIN Y tiene el modo admin activado.
 * Para cualquier otro rol, siempre devuelve `false`.
 */
export function useIsAdminModeActive(): boolean {
  const role = useUserRole();
  const adminMode = useAdminModeStore((s) => s.adminMode);
  return role === 'ADMIN' && adminMode;
}
