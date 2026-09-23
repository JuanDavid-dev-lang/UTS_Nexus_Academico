/**
 * El teclado del sistema donde corre la aplicación.
 *
 * Un atajo se declara una vez, con `mod` como modificador principal
 * (`'mod+shift+l'`), y se escribe en pantalla como lo escribe cada sistema:
 * `⇧⌘L` en macOS, `Ctrl+Shift+L` en Windows y Linux. Mostrar «Ctrl» en un Mac
 * no es solo feo: la tecla Control existe y hace otra cosa, así que quien lo
 * siga al pie de la letra pulsa la combinación equivocada y no pasa nada.
 */

export const esMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

type Modificador = 'ctrl' | 'alt' | 'shift' | 'mod';

/** Orden de Apple (Human Interface Guidelines): Control, Opción, Mayúsculas, Comando. */
const ORDEN_MAC: Modificador[] = ['ctrl', 'alt', 'shift', 'mod'];
const SIMBOLO_MAC: Record<Modificador, string> = { ctrl: '⌃', alt: '⌥', shift: '⇧', mod: '⌘' };

const ORDEN_PC: Modificador[] = ['mod', 'ctrl', 'alt', 'shift'];
const NOMBRE_PC: Record<Modificador, string> = { mod: 'Ctrl', ctrl: 'Ctrl', alt: 'Alt', shift: 'Shift' };

/**
 * `'mod+shift+l'` → `⇧⌘L` en Mac, `Ctrl+Shift+L` fuera. La última parte es la
 * tecla; si es una sola letra va en mayúscula, que es como viene rotulada.
 */
export function formatearAtajo(combo: string, mac: boolean = esMac): string {
  const partes = combo.split('+');
  const tecla = partes.pop() ?? '';
  const visible = tecla.length === 1 ? tecla.toUpperCase() : tecla;
  const presentes = (orden: Modificador[]) => orden.filter((m) => partes.includes(m));

  if (mac) return presentes(ORDEN_MAC).map((m) => SIMBOLO_MAC[m]).join('') + visible;
  return [...new Set(presentes(ORDEN_PC).map((m) => NOMBRE_PC[m])), visible].join('+');
}
