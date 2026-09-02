import { describe, expect, it, beforeEach } from 'vitest';
import { useAdminModeStore } from '@/state/admin-mode.store';

describe('useAdminModeStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useAdminModeStore.getState().setAdminMode(true);
  });

  it('permite alternar el modo admin', () => {
    expect(useAdminModeStore.getState().adminMode).toBe(true);

    useAdminModeStore.getState().toggleAdminMode();
    expect(useAdminModeStore.getState().adminMode).toBe(false);
    expect(localStorage.getItem('uts.admin_mode_enabled')).toBe('false');

    useAdminModeStore.getState().toggleAdminMode();
    expect(useAdminModeStore.getState().adminMode).toBe(true);
    expect(localStorage.getItem('uts.admin_mode_enabled')).toBe('true');
  });

  it('guarda explícitamente el modo fijado', () => {
    useAdminModeStore.getState().setAdminMode(false);
    expect(useAdminModeStore.getState().adminMode).toBe(false);
    expect(localStorage.getItem('uts.admin_mode_enabled')).toBe('false');

    useAdminModeStore.getState().setAdminMode(true);
    expect(useAdminModeStore.getState().adminMode).toBe(true);
    expect(localStorage.getItem('uts.admin_mode_enabled')).toBe('true');
  });
});
