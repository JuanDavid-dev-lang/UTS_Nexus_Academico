import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, GraduationCap } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import type { Area, Programa } from '@/domain/schemas/registration';

/**
 * Selector de carreras a cargo.
 *
 * Se elige por **área**, no por título: en las UTS una carrera es una cadena
 * propedéutica —Tecnología en Desarrollo de Sistemas Informáticos continúa en
 * Ingeniería de Sistemas, con los mismos estudiantes avanzando de una a otra—,
 * así que quien coordina, coordina las dos.
 *
 * Con la lista plana de treinta y dos títulos el error fácil era marcar solo el
 * tecnológico y no enterarse nunca: una lista a la que le falta la mitad
 * profesional de la propia carrera no se distingue de una lista corta. Aquí una
 * casilla marca la carrera entera y el detalle queda plegado para el caso raro
 * de coordinar un solo ciclo — que sigue siendo posible, y se ve como «a
 * medias» en vez de pasar por completo.
 */
export function AreasPicker({
  areas,
  programas,
  seleccion,
  onChange,
  disabled,
}: {
  areas: Area[];
  /** Catálogo de programas, para el nombre de cada ciclo. */
  programas: Programa[];
  /** Ids de **programa** seleccionados: es lo que se guarda. */
  seleccion: string[];
  onChange: (programas: string[]) => void;
  disabled?: boolean;
}) {
  const [abierta, setAbierta] = useState<string | null>(null);

  const nombrePrograma = useMemo(
    () => new Map(programas.map((programa) => [programa.id, programa])),
    [programas],
  );

  const elegidos = useMemo(() => new Set(seleccion), [seleccion]);

  function alternarArea(area: Area) {
    const completa = area.programas.every((programa) => elegidos.has(programa));
    const siguiente = new Set(elegidos);
    for (const programa of area.programas) {
      if (completa) siguiente.delete(programa);
      else siguiente.add(programa);
    }
    onChange([...siguiente]);
  }

  function alternarPrograma(id: string) {
    const siguiente = new Set(elegidos);
    if (siguiente.has(id)) siguiente.delete(id);
    else siguiente.add(id);
    onChange([...siguiente]);
  }

  // Sin áreas —un servidor anterior a ellas— se cae a la lista de programas
  // sueltos: peor de usar, pero funcionando, que es lo que toca cuando el
  // cliente va por delante del backend.
  if (areas.length === 0) {
    return (
      <div className="max-h-64 overflow-y-auto rounded-xl border border-border p-2">
        {programas.map((programa) => (
          <label
            key={programa.id}
            className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-alt"
          >
            <input
              type="checkbox"
              className="size-4 accent-[var(--accent)]"
              checked={elegidos.has(programa.id)}
              disabled={disabled}
              onChange={() => alternarPrograma(programa.id)}
            />
            <span className="text-body text-text">{programa.nombre}</span>
          </label>
        ))}
      </div>
    );
  }

  return (
    <div className="max-h-72 overflow-y-auto rounded-xl border border-border p-1">
      {areas.map((area) => {
        const dentro = area.programas.filter((programa) => elegidos.has(programa));
        const completa = dentro.length === area.programas.length;
        const aMedias = dentro.length > 0 && !completa;
        const desplegada = abierta === area.id;

        return (
          <div key={area.id} className="rounded-lg">
            <div
              className={cn(
                'flex items-center gap-2 rounded-lg px-2 py-1.5',
                completa && 'bg-accent-soft',
                aMedias && 'bg-surface-alt',
              )}
            >
              <input
                type="checkbox"
                className="size-4 shrink-0 accent-[var(--accent)]"
                checked={completa}
                // El estado intermedio no es cosmético: es la diferencia entre
                // «coordina la carrera» y «coordina solo el tecnológico».
                ref={(nodo) => {
                  if (nodo) nodo.indeterminate = aMedias;
                }}
                disabled={disabled}
                onChange={() => alternarArea(area)}
                id={`area-${area.id}`}
              />
              <label
                htmlFor={`area-${area.id}`}
                className="min-w-0 flex-1 cursor-pointer truncate text-body text-text"
              >
                {area.nombre}
                {aMedias && (
                  <span className="ml-2 text-caption text-warning">
                    solo {dentro.length} de {area.programas.length}
                  </span>
                )}
              </label>

              {area.programas.length > 1 && (
                <button
                  type="button"
                  className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-caption text-muted hover:bg-surface-sunken"
                  onClick={() => setAbierta(desplegada ? null : area.id)}
                  aria-expanded={desplegada}
                >
                  {desplegada ? (
                    <ChevronDown className="size-3.5" aria-hidden />
                  ) : (
                    <ChevronRight className="size-3.5" aria-hidden />
                  )}
                  {area.programas.length} títulos
                </button>
              )}
            </div>

            {desplegada && (
              <div className="ml-6 border-l border-border pl-2">
                {area.programas.map((id) => {
                  const programa = nombrePrograma.get(id);
                  return (
                    <label
                      key={id}
                      className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 hover:bg-surface-alt"
                    >
                      <input
                        type="checkbox"
                        className="size-3.5 accent-[var(--accent)]"
                        checked={elegidos.has(id)}
                        disabled={disabled}
                        onChange={() => alternarPrograma(id)}
                      />
                      <GraduationCap className="size-3.5 shrink-0 text-muted" aria-hidden />
                      <span className="truncate text-caption text-muted">
                        {programa?.nombre ?? id}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Resumen legible de una selección: «2 carreras · 4 títulos». */
export function resumenDeSeleccion(areas: Area[], seleccion: string[]): string {
  if (seleccion.length === 0) return 'Ninguna carrera marcada';
  const elegidos = new Set(seleccion);
  const carreras = areas.filter((area) =>
    area.programas.some((programa) => elegidos.has(programa)),
  ).length;
  return `${carreras} carrera${carreras === 1 ? '' : 's'} · ${seleccion.length} título${
    seleccion.length === 1 ? '' : 's'
  }`;
}
