import { create } from 'zustand';
import type { SyncStatus } from '@/core/realtime/socket';

type SyncState = {
  status: SyncStatus;
  detail: string | undefined;
  /** Timestamp of the last successful sync event, for the "updated X ago" hint. */
  lastEventAt: number | null;
  set: (status: SyncStatus, detail?: string) => void;
  markEvent: () => void;
};

export const useSync = create<SyncState>((set) => ({
  status: 'disconnected',
  detail: undefined,
  lastEventAt: null,

  set(status, detail) {
    set({ status, detail });
  },

  markEvent() {
    set({ lastEventAt: Date.now() });
  },
}));
