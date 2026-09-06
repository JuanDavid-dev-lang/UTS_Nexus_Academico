import { useInfiniteQuery, type QueryKey } from '@tanstack/react-query';
import { useMemo } from 'react';

/**
 * Listado que se trae por páginas y se va acumulando.
 *
 * El backend pagina todos sus listados desde hace tiempo —`paginacionCon()`
 * devuelve `items`, `total` y `hasMore`— pero **casi nadie se lo pedía**: las
 * pantallas llamaban sin `page` ni `limit` y recibían el tope por defecto
 * entero, que en estudiantes son mil documentos completos en cada montaje.
 *
 * El render nunca fue el problema: `DataTable` está virtualizada, así que mil
 * filas no son mil nodos. Lo que cuesta son los mil documentos viajando por la
 * red y saliendo de Atlas, y eso no lo arregla ninguna virtualización.
 *
 * Devuelve la forma que espera `DataTable`, para que enchufar una pantalla sea
 * pasarle cuatro props y no reescribirla.
 */

export type PaginaDe<T> = {
  items: T[];
  total: number;
  hasMore: boolean;
};

/**
 * Tamaño de página.
 *
 * Cincuenta llena de sobra la tabla más alta que cabe en una pantalla de
 * escritorio (unas 20 filas visibles con `maxHeight` por defecto), así que la
 * segunda página se pide con el usuario ya desplazándose y nunca se ve el
 * hueco. Bajarlo a 20 haría que la primera pantalla ya necesitara dos viajes.
 */
export const TAMANO_PAGINA = 50;

export function useListadoPaginado<T>({
  queryKey,
  consultar,
  enabled = true,
  tamanoPagina = TAMANO_PAGINA,
}: {
  queryKey: QueryKey;
  consultar: (parametros: { page: number; limit: number }) => Promise<PaginaDe<T>>;
  enabled?: boolean;
  tamanoPagina?: number;
}) {
  const consulta = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => consultar({ page: pageParam, limit: tamanoPagina }),
    initialPageParam: 1,
    /**
     * `hasMore` lo decide el servidor comparando `page * limit` con `total`, y
     * por eso se usa tal cual en vez de deducirlo aquí de si la página vino
     * llena. Deducirlo obliga a una consulta de más para descubrir que no queda
     * nada cuando el total es múltiplo exacto del tamaño de página.
     */
    getNextPageParam: (ultima, todas) => (ultima.hasMore ? todas.length + 1 : undefined),
  });

  const items = useMemo(
    () => consulta.data?.pages.flatMap((pagina) => pagina.items) ?? [],
    [consulta.data],
  );

  return {
    ...consulta,
    items,
    /** El total del servidor, no el de lo ya cargado. */
    total: consulta.data?.pages[0]?.total ?? 0,
    /**
     * Props listas para `DataTable`. Se devuelven agrupadas a propósito: la
     * alternativa es que cada pantalla recuerde las cuatro y las cablee bien, y
     * la que se equivoque no dará error — se quedará sin paginar.
     */
    propsDeTabla: {
      total: consulta.data?.pages[0]?.total ?? 0,
      hayMas: consulta.hasNextPage,
      cargandoMas: consulta.isFetchingNextPage,
      onCargarMas: () => {
        if (!consulta.isFetchingNextPage && consulta.hasNextPage) void consulta.fetchNextPage();
      },
    },
    enabled,
  };
}
