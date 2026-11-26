import { toast } from '@/state/toast.store';
import { esWeb } from '@/core/platform/tauri';
import { avisoDeFalloDelServidor, type DondeSeGuarda } from '@/domain/offline/aviso-servidor';

/** Entre dos avisos de «guardado en local». */
const MIN_ENTRE_AVISOS_MS = 20_000;
let ultimoAviso = 0;

/**
 * Dónde queda la cola de envíos: en el escritorio, en disco; en la web, en
 * memoria de la pestaña (ver `core/offline/outbox.ts`).
 */
export function dondeSeGuarda(): DondeSeGuarda {
  return esWeb ? 'pestana' : 'equipo';
}

/**
 * Avisa de que algo quedó en la cola, no más de una vez cada 20 s.
 *
 * Pasar lista sin conexión son treinta clics seguidos; un aviso por clic
 * taparía la lista que se está llenando, y la insignia de la barra superior ya
 * lleva la cuenta de lo que espera. El texto no dice que el servidor «se
 * cayó»: dice que lo escrito no se pierde (`domain/offline/aviso-servidor.ts`).
 */
export function avisarGuardadoEnEquipo(ahora = Date.now()): void {
  if (ahora - ultimoAviso < MIN_ENTRE_AVISOS_MS) return;
  ultimoAviso = ahora;
  const aviso = avisoDeFalloDelServidor(dondeSeGuarda());
  toast.info(aviso.titulo, aviso.detalle);
}
