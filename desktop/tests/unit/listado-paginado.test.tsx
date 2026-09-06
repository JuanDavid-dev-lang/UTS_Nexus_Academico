import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useListadoPaginado } from '@/shared/hooks/use-listado-paginado';

/**
 * Lo que estas pruebas fijan es el contrato con `DataTable`, que es donde se
 * rompe en silencio: si `propsDeTabla` deja de traer `hayMas`, la tabla no da
 * error — simplemente deja de pedir páginas y la lista se queda a medias.
 */
function envoltorio() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

/** Servidor de mentira: `total` documentos repartidos en páginas de `limit`. */
function servidor(total: number) {
  return vi.fn(async ({ page, limit }: { page: number; limit: number }) => {
    const desde = (page - 1) * limit;
    const items = Array.from({ length: Math.max(0, Math.min(limit, total - desde)) }, (_, i) => ({
      id: `x${desde + i}`,
    }));
    return { items, total, hasMore: desde + items.length < total };
  });
}

describe('useListadoPaginado', () => {
  it('trae la primera página y anuncia que hay más', async () => {
    const consultar = servidor(120);
    const { result } = renderHook(
      () => useListadoPaginado({ queryKey: ['t', 1], consultar, tamanoPagina: 50 }),
      { wrapper: envoltorio() },
    );

    await waitFor(() => expect(result.current.items).toHaveLength(50));
    expect(result.current.total).toBe(120);
    expect(result.current.propsDeTabla.hayMas).toBe(true);
    expect(consultar).toHaveBeenCalledTimes(1);
  });

  it('acumula las páginas en vez de sustituirlas', async () => {
    const consultar = servidor(120);
    const { result } = renderHook(
      () => useListadoPaginado({ queryKey: ['t', 2], consultar, tamanoPagina: 50 }),
      { wrapper: envoltorio() },
    );

    await waitFor(() => expect(result.current.items).toHaveLength(50));
    result.current.propsDeTabla.onCargarMas();
    await waitFor(() => expect(result.current.items).toHaveLength(100));

    // Sin duplicados y en orden: dos páginas seguidas, no dos veces la primera.
    expect(result.current.items[0]).toEqual({ id: 'x0' });
    expect(result.current.items[99]).toEqual({ id: 'x99' });
  });

  it('deja de pedir cuando el servidor dice que no queda nada', async () => {
    const consultar = servidor(120);
    const { result } = renderHook(
      () => useListadoPaginado({ queryKey: ['t', 3], consultar, tamanoPagina: 50 }),
      { wrapper: envoltorio() },
    );

    await waitFor(() => expect(result.current.items).toHaveLength(50));
    result.current.propsDeTabla.onCargarMas();
    await waitFor(() => expect(result.current.items).toHaveLength(100));
    result.current.propsDeTabla.onCargarMas();
    await waitFor(() => expect(result.current.items).toHaveLength(120));

    await waitFor(() => expect(result.current.propsDeTabla.hayMas).toBe(false));

    // La cuarta llamada no debe salir: `hasMore` ya dijo que no hay más.
    result.current.propsDeTabla.onCargarMas();
    await new Promise((r) => setTimeout(r, 20));
    expect(consultar).toHaveBeenCalledTimes(3);
  });

  it('un listado que cabe en una página no anuncia que haya más', async () => {
    const consultar = servidor(12);
    const { result } = renderHook(
      () => useListadoPaginado({ queryKey: ['t', 4], consultar, tamanoPagina: 50 }),
      { wrapper: envoltorio() },
    );

    await waitFor(() => expect(result.current.items).toHaveLength(12));
    expect(result.current.propsDeTabla.hayMas).toBe(false);
    expect(result.current.propsDeTabla.total).toBe(12);
  });

  it('un listado vacío no rompe ni pide una segunda página', async () => {
    const consultar = servidor(0);
    const { result } = renderHook(
      () => useListadoPaginado({ queryKey: ['t', 5], consultar, tamanoPagina: 50 }),
      { wrapper: envoltorio() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.items).toEqual([]);
    expect(result.current.total).toBe(0);
    expect(result.current.propsDeTabla.hayMas).toBe(false);
  });

  it('el total es el del servidor, no el de lo ya cargado', async () => {
    // Es lo que evita el subtítulo que dice «50 estudiantes» sobre ochocientos.
    const consultar = servidor(837);
    const { result } = renderHook(
      () => useListadoPaginado({ queryKey: ['t', 6], consultar, tamanoPagina: 50 }),
      { wrapper: envoltorio() },
    );

    await waitFor(() => expect(result.current.items).toHaveLength(50));
    expect(result.current.total).toBe(837);
  });
});
