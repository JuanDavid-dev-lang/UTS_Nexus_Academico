import { useSyncExternalStore } from 'react';

/**
 * Suscripción a una media query.
 *
 * Se usa `useSyncExternalStore` en vez de `useState` + `useEffect` porque el
 * primer render ya devuelve el valor real: con el efecto, la aplicación pintaba
 * un fotograma con la disposición ancha y la corregía después, y en una ventana
 * estrecha ese salto se ve.
 *
 * Nota sobre la escala de Windows: al 125% o 150% el WebView no cambia de
 * resolución, reduce el viewport en píxeles CSS. Una consulta por ancho ya
 * recoge el escalado sin tener que leer `devicePixelRatio`.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      // jsdom no implementa matchMedia; en las pruebas la respuesta es "no
      // coincide" y el componente se renderiza en su disposición ancha.
      if (typeof window === 'undefined' || !window.matchMedia) return () => undefined;
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    () => {
      if (typeof window === 'undefined' || !window.matchMedia) return false;
      return window.matchMedia(query).matches;
    },
    () => false,
  );
}

/**
 * Anchos a los que cambia la disposición.
 *
 * No son los de Tailwind a propósito: aquí lo que decide no es el tamaño de la
 * pantalla sino cuánto espacio le queda al contenido una vez descontado el menú
 * lateral de 264px.
 */
export const LAYOUT_QUERIES = {
  /** El menú se contrae a iconos: 264px de etiquetas ya no se pagan solos. */
  compact: '(max-width: 1180px)',
  /** El menú deja de ocupar sitio y pasa a abrirse por encima del contenido. */
  narrow: '(max-width: 860px)',
} as const;
