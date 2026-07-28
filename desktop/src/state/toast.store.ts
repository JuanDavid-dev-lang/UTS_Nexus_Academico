/**
 * Toast notifications.
 *
 * Replaces the QMessageBox dialogs of v1. A modal dialog for "grade saved"
 * interrupts the teacher's flow and demands a click; a toast informs without
 * stealing focus, and errors stay until dismissed because they need a decision.
 */
import { create } from 'zustand';
import { toAppError } from '@/core/api/errors';

export type ToastTone = 'success' | 'error' | 'warning' | 'info';

export type Toast = {
  id: string;
  tone: ToastTone;
  title: string;
  description?: string;
  /** Optional inline action, e.g. "Open folder" after an export. */
  action?: { label: string; onClick: () => void };
  durationMs: number;
};

type ToastState = {
  toasts: Toast[];
  push: (toast: Omit<Toast, 'id' | 'durationMs'> & { durationMs?: number }) => string;
  dismiss: (id: string) => void;
  clear: () => void;
};

let counter = 0;
const nextId = () => `toast-${++counter}`;

/** Errors persist until dismissed; confirmations disappear on their own. */
const DEFAULT_DURATION: Record<ToastTone, number> = {
  success: 3500,
  info: 4000,
  warning: 6000,
  error: 0,
};

export const useToasts = create<ToastState>((set, get) => ({
  toasts: [],

  push(input) {
    const id = nextId();
    const durationMs = input.durationMs ?? DEFAULT_DURATION[input.tone];
    const toast: Toast = { id, durationMs, ...input };

    set((state) => ({ toasts: [...state.toasts, toast] }));

    if (durationMs > 0) {
      setTimeout(() => get().dismiss(id), durationMs);
    }
    return id;
  },

  dismiss(id) {
    set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }));
  },

  clear() {
    set({ toasts: [] });
  },
}));

/** Imperative helpers so non-React code (repositories, hooks) can notify too. */
export const toast = {
  success: (title: string, description?: string) =>
    useToasts.getState().push({ tone: 'success', title, ...(description ? { description } : {}) }),

  info: (title: string, description?: string) =>
    useToasts.getState().push({ tone: 'info', title, ...(description ? { description } : {}) }),

  warning: (title: string, description?: string) =>
    useToasts.getState().push({ tone: 'warning', title, ...(description ? { description } : {}) }),

  error: (title: string, description?: string) =>
    useToasts.getState().push({ tone: 'error', title, ...(description ? { description } : {}) }),

  /** Turns any thrown value into a readable toast. */
  fromError: (error: unknown, title = 'No se pudo completar la acción') =>
    useToasts.getState().push({ tone: 'error', title, description: toAppError(error).message }),

  withAction: (
    tone: ToastTone,
    title: string,
    description: string,
    action: { label: string; onClick: () => void },
  ) => useToasts.getState().push({ tone, title, description, action }),
};
