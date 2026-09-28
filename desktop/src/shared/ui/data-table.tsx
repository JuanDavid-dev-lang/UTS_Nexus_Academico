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

/**
 * Por debajo de este ancho la tabla se pinta como tarjetas.
 *
 * Se mide el hueco de la tabla y no la ventana: en un teléfono (la versión web
 * instalada en el iPhone) cuatro columnas en 360 px dejaban «J..», «20...» e
 * «In...» — el nombre, la cédula y el programa cortados, que es justo lo que
 * se viene a leer. En tarjeta cada dato tiene su renglón y su etiqueta.
 */
const ANCHO_TARJETAS = 640;

/** Alto estimado de una tarjeta; el real lo mide el virtualizador. */
const ALTO_TARJETA = 132;

/** La columna de botones va arriba a la derecha de la tarjeta, sin etiqueta. */
function esColumnaDeAcciones<T>(column: Column<T>): boolean {
  const clave = column.key.toLowerCase();
  return clave === 'actions' || clave === 'acciones' || column.header.trim() === '';
}

/** Ancho del contenedor, para decidir entre filas y tarjetas. */
function useAnchoDe(ref: React.RefObject<HTMLElement | null>): number | null {
  // Arranca con el ancho de la ventana, que nunca es menor que el del hueco:
  // en un teléfono ya sale en tarjetas sin pintar antes la tabla un instante.
  const [ancho, setAncho] = useState<number | null>(() =>
    typeof window === 'undefined' ? null : window.innerWidth,
  );
  useEffect(() => {
    const elemento = ref.current;
    if (!elemento || typeof ResizeObserver === 'undefined') return;
    const observador = new ResizeObserver(([entrada]) => {
      if (entrada) setAncho(entrada.contentRect.width);
    });
    observador.observe(elemento);
    return () => observador.disconnect();
  }, [ref]);
  return ancho;
}

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
  const marcoRef = useRef<HTMLDivElement>(null);
  const ancho = useAnchoDe(marcoRef);
  const tarjetas = ancho !== null && ancho < ANCHO_TARJETAS;

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
    estimateSize: () => (tarjetas ? ALTO_TARJETA : ROW_HEIGHT),
    overscan: 8,
  });

  // Al pasar de filas a tarjetas (o al revés) cambian todos los altos: sin
  // volver a medir, el virtualizador colocaría las tarjetas encimadas.
  useEffect(() => {
    virtualizer.measure();
  }, [tarjetas, virtualizer]);

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

  // El marco se queda montado en los dos casos —vacío y con filas— porque es
  // el que se mide: si cambiara de elemento, el observador seguiría mirando
  // el que ya no está y la tabla no se enteraría de que tiene sitio.
  if (rows.length === 0) {
    return (
      <div ref={marcoRef} className="min-w-0">
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
      </div>
    );
  }

  const acciones = columns.find(esColumnaDeAcciones);
  const [principal, ...resto] = columns.filter((column) => column !== acciones);

  return (
    <div ref={marcoRef} className="min-w-0">
      <div className="surface-card overflow-hidden">
        {tarjetas ? (
          <OrdenEnTarjetas columns={columns} sort={sort} onChange={setSort} />
        ) : (
          /* Header lives outside the scroll container so it stays put. */
          <div
            role="row"
            className="grid items-center gap-3 border-b border-border bg-surface-sunken px-4 py-3"
            style={{ gridTemplateColumns: gridTemplate }}
          >
            {columns.map((column) => (
              <EncabezadoDeColumna
                key={column.key}
                column={column}
                sort={sort}
                onToggle={() => toggleSort(column.key)}
              />
            ))}
          </div>
        )}

        <div
          ref={scrollRef}
          className="scrollbar-slim overflow-auto"
          // En tarjetas la lista puede ocupar casi toda la pantalla del
          // teléfono: con la altura de escritorio quedaba una ventanita de dos
          // tarjetas entre la cabecera y el borde.
          style={{ maxHeight: tarjetas ? 'calc(100dvh - 140px)' : maxHeight }}
        >
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualItems.map((virtualRow) => {
              const row = sortedRows[virtualRow.index];
              if (!row) return null;
              const retraso = retrasoEscalonado(virtualRow.index, nuevasDesde);

              return (
                <div
                  key={getRowId(row)}
                  role="row"
                  data-index={virtualRow.index}
                  ref={tarjetas ? virtualizer.measureElement : undefined}
                  className={cn(
                    'group absolute left-0 top-0 w-full px-4',
                    tarjetas ? 'py-3' : 'grid items-center gap-3',
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
                    // En tarjetas el alto lo pone el contenido y lo mide el
                    // virtualizador; fijarlo cortaría la última línea.
                    ...(tarjetas ? {} : { height: virtualRow.size, gridTemplateColumns: gridTemplate }),
                    transform: `translateY(${virtualRow.start}px)`,
                    // Escalonado dentro de la tanda, con tope: con cincuenta
                    // filas nuevas, escalonarlas todas dejaría la última entrando
                    // dos segundos después de la primera.
                    ...(retraso ? { animationDelay: retraso } : {}),
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
                  {tarjetas ? (
                    <Tarjeta row={row} principal={principal} resto={resto} acciones={acciones} />
                  ) : (
                    columns.map((column) => (
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
                    ))
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border bg-surface-alt/60 px-4 py-2 text-caption text-muted">
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
          {sort && !tarjetas ? (
            <span className="truncate">
              Ordenado por {columns.find((column) => column.key === sort.key)?.header ?? sort.key}{' '}
              {sort.direction === 'asc' ? '↑' : '↓'}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function EncabezadoDeColumna<T>({
  column,
  sort,
  onToggle,
}: {
  column: Column<T>;
  sort: SortState;
  onToggle: () => void;
}) {
  const active = sort?.key === column.key;
  return (
    <div
      role="columnheader"
      aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={cn(
        'text-caption font-semibold uppercase tracking-wide text-muted',
        column.align === 'right' && 'text-right',
        column.align === 'center' && 'text-center',
      )}
    >
      {column.sortValue ? (
        <button
          type="button"
          onClick={onToggle}
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
}

/**
 * En tarjetas no hay fila de encabezados donde tocar para ordenar, así que el
 * orden se elige de una lista. Sin columnas ordenables no se enseña nada.
 */
function OrdenEnTarjetas<T>({
  columns,
  sort,
  onChange,
}: {
  columns: Column<T>[];
  sort: SortState;
  onChange: (sort: SortState) => void;
}) {
  const ordenables = columns.filter((column) => column.sortValue);
  if (ordenables.length === 0) return null;
  const valor = sort ? `${sort.key}:${sort.direction}` : '';

  return (
    <div className="flex items-center justify-end gap-2 border-b border-border bg-surface-sunken px-4 py-2">
      <label className="flex items-center gap-2 text-caption text-muted">
        Ordenar por
        <select
          value={valor}
          onChange={(event) => {
            const [key, direction] = event.target.value.split(':');
            onChange(key && direction ? { key, direction: direction as 'asc' | 'desc' } : null);
          }}
          className="rounded-md border border-border bg-surface px-2 py-1 text-caption text-text"
        >
          <option value="">Sin ordenar</option>
          {ordenables.flatMap((column) => [
            <option key={`${column.key}:asc`} value={`${column.key}:asc`}>
              {column.header} ↑
            </option>,
            <option key={`${column.key}:desc`} value={`${column.key}:desc`}>
              {column.header} ↓
            </option>,
          ])}
        </select>
      </label>
    </div>
  );
}

/**
 * Una fila como tarjeta: la primera columna es el título, los botones van
 * arriba a la derecha y el resto de columnas son pares etiqueta-valor.
 */
function Tarjeta<T>({
  row,
  principal,
  resto,
  acciones,
}: {
  row: T;
  principal: Column<T> | undefined;
  resto: Column<T>[];
  acciones: Column<T> | undefined;
}) {
  return (
    <>
      <div className="flex items-start gap-3">
        <div role="cell" className="min-w-0 flex-1 text-body text-text">
          {principal?.cell(row)}
        </div>
        {acciones ? (
          // Los botones de la fila no deben abrir la fila al tocarlos.
          <div
            role="cell"
            className="flex shrink-0 items-center gap-1"
            onClick={(event) => event.stopPropagation()}
          >
            {acciones.cell(row)}
          </div>
        ) : null}
      </div>
      {resto.length > 0 ? (
        // Flujo y no cuadrícula: cada dato ocupa lo que mide y baja de línea
        // si no cabe. En dos columnas fijas, un programa largo o «Riesgo alto —
        // Bajo rendimiento» se cortaban junto a una cédula que sobraba de ancho.
        <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-2">
          {resto.map((column) => (
            <div key={column.key} role="cell" className="min-w-0 max-w-full">
              <dt className="text-caption text-muted">{column.header}</dt>
              <dd className="min-w-0 break-words text-body text-text">{column.cell(row)}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </>
  );
}
