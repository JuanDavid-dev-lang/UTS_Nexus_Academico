import { toast } from '@/state/toast.store';

/** Entre dos avisos de «guardado en este equipo». */
const MIN_ENTRE_AVISOS_MS = 20_000;
let ultimoAviso = 0;

/**
 * Avisa de que algo quedó en la cola, no más de una vez cada 20 s.
 *
 * Pasar lista sin conexión son treinta clics seguidos; un aviso por clic
 * taparía la lista que se está llenando, y la insignia de la barra superior ya
 * lleva la cuenta de lo que espera.
 */
export function avisarGuardadoEnEquipo(titulo: string, ahora = Date.now()): void {
  if (ahora - ultimoAviso < MIN_ENTRE_AVISOS_MS) return;
  ultimoAviso = ahora;
  toast.info(titulo, 'Se enviará sola cuando haya conexión.');
}
