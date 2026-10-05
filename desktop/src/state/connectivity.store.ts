import { create } from 'zustand';

/**
 * ¿Hay servidor? El estado que leen la barra superior, las pantallas que
 * necesitan conexión y TanStack Query (vía `onlineManager`).
 *
 * Quién lo mueve está en `core/offline/conectividad.ts`; esto es solo el dato.
 * Se asume que hay conexión hasta que algo diga lo contrario: arrancar en
 * «sin conexión» pintaría avisos falsos durante el primer segundo.
 */
type ConnectivityState = {
  online: boolean;
  /** Instante del último cambio, para «sin conexión desde hace…». */
  desde: number;
  setOnline: (online: boolean) => void;
};

export const useConectividad = create<ConnectivityState>((set, get) => ({
  online: true,
  desde: Date.now(),
  setOnline(online) {
    if (get().online === online) return;
    set({ online, desde: Date.now() });
  },
}));

/** Para las pantallas: `true` con servidor. */
export const useEnLinea = () => useConectividad((state) => state.online);
