import { useMemo, useRef, useState } from 'react';
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

const ROW_HEIGHT = 48;

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
        className="grid items-center gap-3 border-b border-border bg-surface-alt px-4 py-2.5"
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
                'text-[11px] font-semibold uppercase tracking-wide text-muted',
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
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const row = sortedRows[virtualRow.index];
            if (!row) return null;

            return (
              <div
                key={getRowId(row)}
                role="row"
                className={cn(
                  'absolute left-0 top-0 grid w-full items-center gap-3 border-b border-border px-4',
                  'transition-colors duration-100 hover:bg-surface-alt',
                  onRowClick && 'cursor-pointer',
                )}
                style={{
                  height: virtualRow.size,
                  transform: `translateY(${virtualRow.start}px)`,
                  gridTemplateColumns: gridTemplate,
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
                      'min-w-0 truncate text-sm text-text',
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

      <div className="border-t border-border px-4 py-2 text-[11px] text-muted">
        {sortedRows.length} {sortedRows.length === 1 ? 'registro' : 'registros'}
      </div>
    </div>
  );
}
