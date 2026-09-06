import { useEffect, useRef, useState } from 'react';

/**
 * A partir de qué índice los elementos acaban de llegar.
 *
 * Devuelve `null` cuando no hay ninguno nuevo, y ese `null` es la mitad
 * importante: la marca **se limpia sola** pasada la animación.
 *
 * Sin limpiarla, dos cosas salen mal y las dos se ven feas antes de que nadie
 * entienda por qué. En una tabla virtualizada, una fila que sale de pantalla y
 * vuelve se **remonta**, así que cada viaje del cursor volvería a animar las
 * mismas filas. Y en una lista normal, cualquier repintado por otra causa
 * —abrir un menú, cambiar de tema— reproduciría la entrada de golpe.
 *
 * Una lista que **encoge** no anima nada: lo que queda tras filtrar no es
 * nuevo, es lo que sobrevivió.
 */
export function useTandaNueva(longitud: number, duracionMs = 620): number | null {
  const [desde, setDesde] = useState<number | null>(null);
  const anterior = useRef(longitud);

  useEffect(() => {
    if (longitud > anterior.current) {
      setDesde(anterior.current);
      anterior.current = longitud;
      const temporizador = setTimeout(() => setDesde(null), duracionMs);
      return () => clearTimeout(temporizador);
    }
    anterior.current = longitud;
    return undefined;
  }, [longitud, duracionMs]);

  return desde;
}

/**
 * Retraso escalonado de un elemento dentro de su tanda, con tope.
 *
 * El tope no es cosmético: con cincuenta elementos nuevos, escalonarlos todos
 * dejaría el último entrando más de un segundo después del primero. Para
 * entonces ya nadie lo mira y lo único que queda es una lista que tarda en
 * asentarse.
 */
export function retrasoEscalonado(indice: number, desde: number | null): string | undefined {
  if (desde === null || indice < desde) return undefined;
  return `${Math.min(indice - desde, 12) * 22}ms`;
}
