import { create } from 'zustand';
import { resumirCola, type OutboxEntry, type ResumenCola } from '@/domain/offline/outbox';

/**
 * La cola de envíos del usuario actual, para la interfaz.
 *
 * Lo que cambia la cola vive en `core/offline/outbox.service.ts`; las
 * pantallas solo leen de aquí. `recientes` son las entradas que acaban de
 * subirse y cuya lectura fresca aún no ha llegado: se siguen superponiendo
 * para que la nota no «parpadee» entre desaparecer de la cola y aparecer en el
 * consolidado.
 */
type OutboxState = {
  entradas: OutboxEntry[];
  recientes: OutboxEntry[];
  drenando: boolean;
  /** La cola se guarda en disco; falso en la versión web, donde vive en memoria. */
  persiste: boolean;
};

export const useOutbox = create<OutboxState>(() => ({
  entradas: [],
  recientes: [],
  drenando: false,
  persiste: false,
}));

const VACIO: ResumenCola = { pendientes: 0, enviando: 0, fallidas: 0, total: 0 };
let ultimoResumen: { de: OutboxEntry[]; valor: ResumenCola } = { de: [], valor: VACIO };

/** Resumen con identidad estable mientras la cola no cambie (evita renders de más). */
export function resumenDeLaCola(entradas: OutboxEntry[]): ResumenCola {
  if (entradas === ultimoResumen.de) return ultimoResumen.valor;
  ultimoResumen = { de: entradas, valor: resumirCola(entradas) };
  return ultimoResumen.valor;
}

export const useResumenDeCola = () => useOutbox((state) => resumenDeLaCola(state.entradas));
