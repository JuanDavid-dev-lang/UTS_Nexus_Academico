import { useEffect, useMemo, useRef, useState } from 'react';
import { retrasoEscalonado, useTandaNueva } from '@/shared/hooks/use-tanda-nueva';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { EmptyState, NoResultsState } from '@/shared/ui/state-view';

/**
 * Virtualised data table.
 *
 * Only the visible rows exist in the DOM, so a thousand students scroll as
 * smoothly as ten. The v1 client rendered every row eagerly and froze on large
 * groups - that is the specific bug this component exists to prevent.
 */

export type Column<T> = {
  key: string;
  header: string;
  /** Cell renderer. Keep it cheap: it runs on every visible row on each scroll. */
  cell: (row: T) => React.ReactNode;
  /** Value used for sorting; omit to make the column unsortable. */
  sortValue?: (row: T) => string | number;
  width?: string;
  align?: 'left' | 'right' | 'center';
};

type SortState = { key: string; direction: 'asc' | 'desc' } | null;

/**
 * 52 en vez de 48.
 *
 * Las celdas llevan chips de estado de 22 px de alto y con 48 el chip quedaba a
 * 13 px del borde superior y a 13 del inferior: técnicamente centrado, pero sin
 * aire para que la fila se leyera como una unidad. Cuatro píxeles por fila son
 * ocho filas menos en una pantalla de mil, que es un precio que se paga.
 */
const ROW_HEIGHT = 52;

/**
 * Cuántas filas antes del final se pide la página siguiente.
 *
 * Ocho es algo más de lo que cabe en el hueco visible por debajo del cursor
 * mientras se desplaza a velocidad normal: da tiempo a que la petición vuelva
 * antes de que el usuario llegue al vacío. Con un umbral de una o dos filas la
 * lista se para en seco y **se siente** como un fallo aunque no lo sea.
 */
const FILAS_ANTES_DEL_FINAL = 8;

/**
 * Cuánto dura la entrada de las filas recién llegadas.
 *
 * La animación no es decoración: distingue «acaban de llegar filas» de «la
 * lista siempre estuvo así». Sin ella, una tanda nueva aparece de golpe bajo el
 * cursor y no hay forma de saber si el desplazamiento saltó o si el contenido
 * cambió.
 */
const ENTRADA_MS = 420;

export function DataTable<T>({
  rows,
  columns,
  getRowId,
  searchQuery = '',
  onClearSearch,
  emptyTitle,
  emptyMessage,
  onRowClick,
  maxHeight = 'calc(100vh - 320px)',
  total,
  hayMas = false,
  cargandoMas = false,
  onCargarMas,
}: {
  rows: T[];
  columns: Column<T>[];
  getRowId: (row: T) => string;
  searchQuery?: string;
  onClearSearch?: () => void;
  emptyTitle?: string;
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
  maxHeight?: string;
  /** Cuántos hay en total en el servidor, si se sabe. */
  total?: number;
  /** ¿Queda alguna página por pedir? */
  hayMas?: boolean;
  /** ¿Se está pidiendo ahora mismo? */
  cargandoMas?: boolean;
  /** Pide la página siguiente. Sin esto, la tabla no pagina y se comporta como antes. */
  onCargarMas?: () => void;
}) {
  const [sort, setSort] = useState<SortState>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const sortedRows = useMemo(() => {
    if (!sort) return rows;
    const column = columns.find((candidate) => candidate.key === sort.key);
    if (!column?.sortValue) return rows;

    const direction = sort.direction === 'asc' ? 1 : -1;
    return [...rows].sort((left, right) => {
      const leftValue = column.sortValue!(left);
      const rightValue = column.sortValue!(right);

      if (typeof leftValue === 'number' && typeof rightValue === 'number') {
        return (leftValue - rightValue) * direction;
      }
      return String(leftValue).localeCompare(String(rightValue), 'es') * direction;
    });
  }, [rows, sort, columns]);

  const virtualizer = useVirtualizer({
    count: sortedRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  });

  const virtualItems = virtualizer.getVirtualItems();

  // Índice a partir del cual las filas acaban de llegar. El hook se encarga de
  // limpiarlo pasada la animación, que es lo que impide que una fila remontada
  // por el virtualizador se vuelva a animar en cada viaje del cursor.
  const nuevasDesde = useTandaNueva(rows.length, ENTRADA_MS + 200);

  /**
   * Pide la página siguiente cuando el desplazamiento se acerca al final.
   *
   * Se decide con el último índice que el virtualizador tiene montado, no con
   * un elemento centinela ni con un `IntersectionObserver`: el centinela tendría
   * que vivir dentro del contenedor virtual, donde las posiciones las calcula el
   * virtualizador y un nodo extra descuadra el alto total. El dato que hace
   * falta ya lo tiene él.
   *
   * `cargandoMas` en la guarda es lo que impide que un desplazamiento rápido
   * dispare tres peticiones solapadas para la misma página.
   */
  const ultimoVisible = virtualItems.at(-1)?.index ?? 0;
  useEffect(() => {
    if (!onCargarMas || !hayMas || cargandoMas) return;
    if (ultimoVisible >= sortedRows.length - FILAS_ANTES_DEL_FINAL) onCargarMas();
  }, [ultimoVisible, sortedRows.length, hayMas, cargandoMas, onCargarMas]);

  function toggleSort(key: string) {
    setSort((current) => {
      if (current?.key !== key) return { key, direction: 'asc' };
      if (current.direction === 'asc') return { key, direction: 'desc' };
      return null;
    });
  }

  const gridTemplate = columns.map((column) => column.width ?? '1fr').join(' ');

  if (rows.length === 0) {
    return (
      <div className="surface-card">
        {searchQuery && onClearSearch ? (
          <NoResultsState query={searchQuery} onClear={onClearSearch} />
        ) : (
          <EmptyState
            {...(emptyTitle ? { title: emptyTitle } : {})}
            {...(emptyMessage ? { message: emptyMessage } : {})}
          />
        )}
      </div>
    );
  }

  return (
    <div className="surface-card overflow-hidden">
      {/* Header lives outside the scroll container so it stays put. */}
      <div
        role="row"
        className="grid items-center gap-3 border-b border-border bg-surface-sunken px-4 py-3"
        style={{ gridTemplateColumns: gridTemplate }}
      >
        {columns.map((column) => {
          const sortable = Boolean(column.sortValue);
          const active = sort?.key === column.key;

          return (
            <div
              key={column.key}
              role="columnheader"
              aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
              className={cn(
                'text-caption font-semibold uppercase tracking-wide text-muted',
                column.align === 'right' && 'text-right',
                column.align === 'center' && 'text-center',
              )}
            >
              {sortable ? (
                <button
                  type="button"
                  onClick={() => toggleSort(column.key)}
                  className={cn(
                    'inline-flex items-center gap-1 rounded transition-colors hover:text-text',
                    active && 'text-text',
                  )}
                >
                  {column.header}
                  {active ? (
                    sort.direction === 'asc' ? (
                      <ArrowUp className="size-3" aria-hidden />
                    ) : (
                      <ArrowDown className="size-3" aria-hidden />
                    )
                  ) : (
                    <ArrowUpDown className="size-3 opacity-40" aria-hidden />
                  )}
                </button>
              ) : (
                column.header
              )}
            </div>
          );
        })}
      </div>

      <div ref={scrollRef} className="scrollbar-slim overflow-auto" style={{ maxHeight }}>
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {virtualItems.map((virtualRow) => {
            const row = sortedRows[virtualRow.index];
            if (!row) return null;

            return (
              <div
                key={getRowId(row)}
                role="row"
                className={cn(
                  'group absolute left-0 top-0 grid w-full items-center gap-3 px-4',
                  // El separador es un borde interior y no `border-b`: con
                  // `border-b` la última fila visible del viewport virtual
                  // dibujaba una línea suelta bajo el final de la lista.
                  'shadow-[inset_0_-1px_0_0_var(--border)]',
                  'transition-colors duration-200 ease-out hover:bg-primary-soft/60',
                  'focus-visible:outline-none focus-visible:bg-primary-soft',
                  onRowClick && 'cursor-pointer',
                  // Entrada solo de la tanda recién llegada.
                  nuevasDesde !== null && virtualRow.index >= nuevasDesde && 'fila-entra',
                )}
                style={{
                  height: virtualRow.size,
                  transform: `translateY(${virtualRow.start}px)`,
                  gridTemplateColumns: gridTemplate,
                  // Escalonado dentro de la tanda, con tope: con cincuenta
                  // filas nuevas, escalonarlas todas dejaría la última entrando
                  // dos segundos después de la primera.
                  ...(retrasoEscalonado(virtualRow.index, nuevasDesde)
                    ? { animationDelay: retrasoEscalonado(virtualRow.index, nuevasDesde) }
                    : {}),
                }}
                {...(onRowClick
                  ? {
                      tabIndex: 0,
                      onClick: () => onRowClick(row),
                      onKeyDown: (event: React.KeyboardEvent) => {
                        if (event.key === 'Enter') onRowClick(row);
                      },
                    }
                  : {})}
              >
                {columns.map((column) => (
                  <div
                    key={column.key}
                    role="cell"
                    className={cn(
                      'min-w-0 truncate text-body text-text',
                      column.align === 'right' && 'text-right',
                      column.align === 'center' && 'text-center',
                    )}
                  >
                    {column.cell(row)}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-border bg-surface-alt/60 px-4 py-2 text-caption text-muted">
        <span className="tabular flex items-center gap-2">
          {cargandoMas ? (
            <>
              <span
                className="size-3 animate-spin rounded-full border-2 border-border border-t-primary"
                aria-hidden
              />
              Cargando más…
            </>
          ) : (
            <>
              {/*
                Decir «120 de 840» y no solo «120» es lo que evita la duda de si
                la lista terminó o se quedó a medias. Cuando ya está todo, se
                dice el total a secas: repetir «840 de 840» solo añade ruido.
              */}
              {typeof total === 'number' && hayMas
                ? `${sortedRows.length} de ${total} ${total === 1 ? 'registro' : 'registros'}`
                : `${sortedRows.length} ${sortedRows.length === 1 ? 'registro' : 'registros'}`}
            </>
          )}
        </span>
        {sort ? (
          <span>
            Ordenado por {columns.find((column) => column.key === sort.key)?.header ?? sort.key}{' '}
            {sort.direction === 'asc' ? '↑' : '↓'}
          </span>
        ) : null}
      </div>
    </div>
  );
}
