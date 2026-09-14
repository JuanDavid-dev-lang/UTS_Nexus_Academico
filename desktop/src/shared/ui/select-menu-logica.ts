/**
 * Lo que decide el menú propio de `NativeSelect` en Linux, sin React ni DOM
 * pintado: qué opciones hay, cuál es la siguiente elegible y cómo se elige una
 * igual que lo haría el navegador. El porqué del menú está en `select-menu.tsx`.
 */

/** WebKitGTK: Linux de escritorio. Android también dice «Linux» y no lo necesita. */
export const usarMenuPropio: boolean =
  typeof navigator !== 'undefined' && /Linux/.test(navigator.userAgent) && !/Android/.test(navigator.userAgent);

type Opcion = { indice: number; texto: string; deshabilitada: boolean };

export function opcionesDe(select: HTMLSelectElement): Opcion[] {
  return Array.from(select.options).map((opcion, indice) => ({
    indice,
    texto: opcion.text,
    deshabilitada: opcion.disabled,
  }));
}

/** Elige una opción como lo haría el navegador: valor nuevo y `input` + `change`. */
export function elegirOpcion(select: HTMLSelectElement, indice: number): void {
  if (select.selectedIndex === indice) return;
  select.selectedIndex = indice;
  select.dispatchEvent(new Event('input', { bubbles: true }));
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

/** La siguiente opción habilitada en esa dirección, o la misma si no hay. */
export function siguienteHabilitada(opciones: Opcion[], desde: number, paso: 1 | -1): number {
  for (let i = desde + paso; i >= 0 && i < opciones.length; i += paso) {
    if (!opciones[i]!.deshabilitada) return i;
  }
  return desde;
}

