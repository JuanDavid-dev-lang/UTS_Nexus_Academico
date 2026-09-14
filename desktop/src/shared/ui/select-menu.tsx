import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { elegirOpcion, opcionesDe } from './select-menu-logica';

type Posicion = { left: number; width: number; maxHeight: number; top?: number; bottom?: number };

function posicionPara(select: HTMLSelectElement): Posicion {
  const caja = select.getBoundingClientRect();
  const abajo = window.innerHeight - caja.bottom - 12;
  const arriba = caja.top - 12;
  const base = { left: caja.left, width: caja.width };
  // Hacia abajo salvo que no quepa y arriba haya bastante más sitio.
  if (abajo < 180 && arriba > abajo) {
    return { ...base, bottom: window.innerHeight - caja.top + 4, maxHeight: Math.min(320, arriba) };
  }
  return { ...base, top: caja.bottom + 4, maxHeight: Math.min(320, abajo) };
}

/**
 * El menú de un `<select>`, dibujado por la página en Linux.
 *
 * En Linux la app corre sobre WebKitGTK, y ahí el menú nativo de un `<select>`
 * no es parte de la página: lo pinta GTK como una ventana emergente aparte.
 * Eso trae dos defectos que no se arreglan con CSS:
 *
 * - Sale con el tema claro de GTK aunque la app esté en modo oscuro.
 * - En Wayland no se cierra al cambiar de aplicación: se queda flotando encima
 *   de las demás ventanas.
 *
 * El `<select>` real se queda —con su valor, sus eventos, `react-hook-form` y
 * su lector de pantalla— y solo se sustituye el menú: se impide que abra el
 * nativo y se pinta este, que cambia el valor del `<select>` y dispara su
 * `change` como lo haría el propio navegador. Las sesenta pantallas que usan
 * `NativeSelect` no cambian ni una línea.
 *
 * El foco no sale del `<select>`: las flechas y Enter se atienden desde ahí.
 * Así funciona también dentro de un diálogo, cuyo `FocusScope` devolvería el
 * foco a su sitio si se fuera a un menú que vive fuera de él.
 */
export function MenuDeSelect({
  select,
  activo,
  onActivo,
  onCerrar,
}: {
  select: HTMLSelectElement;
  activo: number;
  onActivo: (indice: number) => void;
  onCerrar: () => void;
}) {
  const [posicion] = useState(() => posicionPara(select));
  const [opciones] = useState(() => opcionesDe(select));
  const lista = useRef<HTMLUListElement>(null);

  // Cambiar de aplicación, redimensionar o desplazar la página lo cierra: es
  // justo lo que el menú de GTK no hacía.
  useEffect(() => {
    const alDesplazar = (evento: Event) => {
      if (lista.current && evento.target instanceof Node && lista.current.contains(evento.target)) return;
      onCerrar();
    };
    window.addEventListener('blur', onCerrar);
    window.addEventListener('resize', onCerrar);
    document.addEventListener('scroll', alDesplazar, true);
    return () => {
      window.removeEventListener('blur', onCerrar);
      window.removeEventListener('resize', onCerrar);
      document.removeEventListener('scroll', alDesplazar, true);
    };
  }, [onCerrar]);

  // Un diálogo de Radix cierra al pulsar fuera de él, y este menú vive en
  // `body`: sin cortar el `pointerdown` aquí, elegir una opción cerraba el
  // diálogo entero.
  useEffect(() => {
    const nodo = lista.current;
    if (!nodo) return;
    const cortar = (evento: Event) => evento.stopPropagation();
    nodo.addEventListener('pointerdown', cortar);
    return () => nodo.removeEventListener('pointerdown', cortar);
  }, []);

  useLayoutEffect(() => {
    lista.current?.querySelector<HTMLElement>(`[data-indice="${activo}"]`)?.scrollIntoView?.({ block: 'nearest' });
  }, [activo]);

  return createPortal(
    <ul
      ref={lista}
      role="listbox"
      style={posicion}
      // Sin robar el foco al `<select>`: el clic no lo desenfoca y el menú no
      // se cierra antes de recibirlo.
      onMouseDown={(evento) => evento.preventDefault()}
      className={cn(
        // `pointer-events-auto`: un diálogo modal deja `body` sin eventos.
        'pointer-events-auto fixed z-[60] overflow-y-auto rounded-xl border border-border bg-surface p-1.5 shadow-pop',
      )}
    >
      {opciones.map((opcion) => {
        const elegida = opcion.indice === select.selectedIndex;
        return (
          <li
            key={opcion.indice}
            role="option"
            aria-selected={elegida}
            aria-disabled={opcion.deshabilitada || undefined}
            data-indice={opcion.indice}
            onMouseEnter={() => !opcion.deshabilitada && onActivo(opcion.indice)}
            onClick={() => {
              if (opcion.deshabilitada) return;
              elegirOpcion(select, opcion.indice);
              onCerrar();
            }}
            className={cn(
              'flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-body text-text',
              opcion.indice === activo && 'bg-surface-alt',
              elegida && 'font-semibold',
              opcion.deshabilitada && 'cursor-default text-subtle',
            )}
          >
            <span className="min-w-0 flex-1 truncate">{opcion.texto}</span>
            {elegida ? <Check className="size-3.5 shrink-0 text-primary" aria-hidden /> : null}
          </li>
        );
      })}
    </ul>,
    document.body,
  );
}
