import { useEffect, useRef } from 'react';

/**
 * Pie de una lista paginada que **no** es una `DataTable`.
 *
 * `DataTable` lleva la carga progresiva dentro porque el disparo tiene que
 * salir de su virtualizador. Una lista de tarjetas no está virtualizada y vive
 * en el desplazamiento normal de la página, así que aquí sí funciona lo
 * habitual: un elemento centinela al final y un `IntersectionObserver`.
 *
 * `rootMargin` de 300 px es lo que hace que se pida **antes** de llegar: da
 * tiempo a que la respuesta vuelva mientras el usuario sigue bajando. Con el
 * centinela disparando al entrar en pantalla exacta, la lista se para en seco y
 * se siente como un fallo aunque no lo sea.
 */
export function CargarMasAlLlegar({
  total,
  hayMas,
  cargandoMas,
  onCargarMas,
  error,
  onReintentar,
  mostrados,
  sustantivo = 'registro',
  sustantivoPlural,
}: {
  total: number;
  hayMas: boolean;
  cargandoMas: boolean;
  onCargarMas: () => void;
  /** Fallo del último intento. La lista sigue visible: no se vacía por esto. */
  error?: unknown;
  onReintentar?: () => void;
  mostrados: number;
  sustantivo?: string;
  sustantivoPlural?: string;
}) {
  const centinela = useRef<HTMLDivElement>(null);
  const plural = sustantivoPlural ?? `${sustantivo}s`;

  useEffect(() => {
    // Sin nada más que traer no hay nada que observar, y montar el observador
    // igualmente deja un `IntersectionObserver` vivo por cada lista terminada.
    if (!hayMas || cargandoMas || error) return undefined;
    const nodo = centinela.current;
    if (!nodo) return undefined;

    const observador = new IntersectionObserver(
      (entradas) => {
        if (entradas[0]?.isIntersecting) onCargarMas();
      },
      { rootMargin: '300px' },
    );
    observador.observe(nodo);
    return () => observador.disconnect();
  }, [hayMas, cargandoMas, error, onCargarMas]);

  if (error) {
    return (
      <div className="flex flex-col items-center gap-2 py-4 text-caption text-muted">
        <span>No se pudieron cargar más.</span>
        {onReintentar ? (
          <button
            type="button"
            onClick={onReintentar}
            className="rounded text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Reintentar
          </button>
        ) : null}
      </div>
    );
  }

  if (cargandoMas) {
    return (
      <div className="flex items-center justify-center gap-2 py-4 text-caption text-muted">
        <span
          className="size-3 animate-spin rounded-full border-2 border-border border-t-primary"
          aria-hidden
        />
        Cargando más…
      </div>
    );
  }

  if (hayMas) {
    // El centinela ocupa el mismo alto que el indicador de carga para que la
    // lista no dé un salto al cambiar de uno a otro.
    return <div ref={centinela} className="h-10" aria-hidden />;
  }

  if (mostrados === 0) return null;

  // Con todo cargado, decir cuántos hay evita la duda de si la lista terminó o
  // se quedó a medias.
  return (
    <p className="py-4 text-center text-caption text-muted">
      {total} {total === 1 ? sustantivo : plural}
    </p>
  );
}
