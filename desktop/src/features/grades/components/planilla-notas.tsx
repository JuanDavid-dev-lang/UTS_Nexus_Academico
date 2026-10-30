import { Fragment, useMemo } from 'react';
import { GradeBadge, Tabs, TabsList, TabsTrigger } from '@/shared/ui';
import { cn } from '@/shared/lib/cn';
import { formatGrade } from '@/shared/lib/format';
import {
  CORTES,
  COMPONENTES,
  celdaComponente,
  celdaCorte,
  pesosDeComponentes,
  type FilaPlanilla,
} from '@/domain/grades/planilla';
import type { ComponentType, ConsolidatedRow, CutNumber } from '@/domain/schemas/grades';

/**
 * Planilla de calificaciones, como la de un colegio: el grupo en orden de
 * lista, numerado, y por cada corte sus tres componentes y la definitiva.
 *
 * Es una `<table>` de verdad y no `DataTable`: necesita encabezados de dos
 * niveles (el corte arriba, sus componentes debajo) y columnas fijas a la
 * izquierda al desplazarse, que una rejilla virtualizada no da. Un grupo son
 * decenas de filas, no miles, así que virtualizar no hace falta.
 *
 * Ninguna cifra se calcula aquí: todas salen del consolidado del servidor.
 */

export type VistaPlanilla = 'completa' | CutNumber;

const ABREVIATURA: Record<ComponentType, { corta: string; larga: string }> = {
  TRABAJOS: { corta: 'Trab.', larga: 'Trabajos' },
  PARCIALES: { corta: 'Parc.', larga: 'Parciales' },
  AUTOEVALUACION: { corta: 'Auto.', larga: 'Autoevaluación' },
};

type Props = {
  filas: FilaPlanilla[];
  consolidado: readonly ConsolidatedRow[];
  vista: VistaPlanilla;
  onVistaChange: (vista: VistaPlanilla) => void;
  onAbrir: (studentId: string) => void;
  /** Materia, grupo y periodo: la cabecera de la hoja. */
  ficha: { titulo: string; detalles: string[] };
};

function Nota({ valor, fuerte = false }: { valor: number; fuerte?: boolean }) {
  return (
    <span className={cn('tabular', valor < 3 ? 'font-semibold text-danger' : fuerte ? 'font-semibold text-text' : 'text-text')}>
      {formatGrade(valor)}
    </span>
  );
}

function SinNota() {
  return (
    <span className="text-subtle" aria-label="Sin calificar">
      —
    </span>
  );
}

export function PlanillaNotas({ filas, consolidado, vista, onVistaChange, onAbrir, ficha }: Props) {
  const pesos = useMemo(() => pesosDeComponentes(consolidado), [consolidado]);
  const cortes = vista === 'completa' ? CORTES : [vista];

  const celdaBase = 'border-b border-border px-2 py-2 text-center text-body';
  const separador = 'border-l border-border';

  return (
    <section className="surface-card overflow-hidden" aria-label="Planilla de calificaciones">
      {/* La cabecera de la hoja: de qué materia y grupo es lo que hay debajo. */}
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-h3 font-semibold text-text">{ficha.titulo}</h2>
          <p className="text-caption text-muted">{ficha.detalles.join(' · ')}</p>
        </div>
        <Tabs value={String(vista)} onValueChange={(valor) => onVistaChange(valor === 'completa' ? 'completa' : (Number(valor) as CutNumber))}>
          <TabsList>
            <TabsTrigger value="completa">Planilla completa</TabsTrigger>
            {CORTES.map((corte) => (
              <TabsTrigger key={corte} value={String(corte)}>
                Corte {corte}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full min-w-max border-separate border-spacing-0">
          <thead className="bg-surface-alt text-caption text-muted">
            <tr>
              <th rowSpan={2} scope="col" className="sticky left-0 z-10 w-10 border-b border-border bg-surface-alt px-2 py-2 text-center font-medium">
                #
              </th>
              <th rowSpan={2} scope="col" className="sticky left-10 z-10 min-w-64 border-b border-r border-border bg-surface-alt px-3 py-2 text-left font-medium">
                Estudiante
              </th>
              {cortes.map((corte) => (
                <th key={corte} colSpan={COMPONENTES.length + 1} scope="colgroup" className={cn('border-b border-border px-2 py-1.5 text-center font-semibold text-text', separador)}>
                  Corte {corte}
                </th>
              ))}
              <th rowSpan={2} scope="col" className={cn('border-b border-border px-3 py-2 text-center font-semibold text-text', separador)}>
                Definitiva
              </th>
            </tr>
            <tr>
              {cortes.map((corte) => (
                <Fragment key={corte}>
                  {COMPONENTES.map((tipo, indice) => {
                    const peso = pesos[tipo];
                    return (
                      <th
                        key={tipo}
                        scope="col"
                        title={ABREVIATURA[tipo].larga}
                        className={cn('border-b border-border px-2 py-1.5 text-center font-medium', indice === 0 && separador)}
                      >
                        {vista === 'completa' ? ABREVIATURA[tipo].corta : ABREVIATURA[tipo].larga}
                        {peso !== undefined ? <span className="block text-subtle">{Math.round(peso * 100)} %</span> : null}
                      </th>
                    );
                  })}
                  <th scope="col" className="border-b border-border bg-surface-hover px-2 py-1.5 text-center font-semibold text-text">
                    Nota
                  </th>
                </Fragment>
              ))}
            </tr>
          </thead>

          <tbody>
            {filas.map((fila, indice) => (
              <tr key={fila.studentId} className="group">
                <td className="sticky left-0 z-[1] border-b border-border bg-surface px-2 py-2 text-center text-caption text-muted tabular group-hover:bg-surface-hover">
                  {indice + 1}
                </td>
                <th scope="row" className="sticky left-10 z-[1] border-b border-r border-border bg-surface px-3 py-1.5 text-left font-normal group-hover:bg-surface-hover">
                  <button
                    type="button"
                    onClick={() => onAbrir(fila.studentId)}
                    className="flex w-full min-w-0 flex-col rounded-sm text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                    aria-label={`Abrir las notas de ${fila.fullName}`}
                  >
                    <span className="truncate font-medium text-text group-hover:text-primary">{fila.fullName}</span>
                    <span className="truncate text-caption text-muted tabular">{fila.code}</span>
                  </button>
                </th>

                {cortes.map((corte) => {
                  const resumen = celdaCorte(fila.row, corte);
                  return (
                    <Fragment key={corte}>
                      {COMPONENTES.map((tipo, posicion) => {
                        const celda = celdaComponente(fila.row, corte, tipo);
                        return (
                          <td
                            key={tipo}
                            className={cn(celdaBase, 'group-hover:bg-surface-hover', posicion === 0 && separador)}
                            title={celda && celda.registros > 1 ? `Promedio de ${celda.registros} notas` : undefined}
                          >
                            {celda ? <Nota valor={celda.promedio} /> : <SinNota />}
                            {celda && celda.registros > 1 ? (
                              <span className="ml-0.5 align-super text-caption text-subtle">{celda.registros}</span>
                            ) : null}
                          </td>
                        );
                      })}
                      <td className={cn(celdaBase, 'bg-surface-alt group-hover:bg-surface-hover')}>
                        {resumen ? (
                          <span
                            className="inline-flex items-center gap-1"
                            title={resumen.completo ? 'Corte completo' : 'Faltan componentes por calificar'}
                          >
                            <Nota valor={resumen.nota} fuerte />
                            {resumen.completo ? null : (
                              <>
                                <span className="size-1.5 shrink-0 rounded-full bg-warning" aria-hidden />
                                <span className="sr-only">Corte incompleto</span>
                              </>
                            )}
                          </span>
                        ) : (
                          <SinNota />
                        )}
                      </td>
                    </Fragment>
                  );
                })}

                <td className={cn(celdaBase, separador, 'group-hover:bg-surface-hover')}>
                  {fila.row ? <GradeBadge value={fila.row.notaFinal} /> : <SinNota />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* La leyenda dice cómo leer la hoja; sin ella el punto ámbar y el
          número volado son adivinanzas. */}
      <footer className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border px-4 py-2 text-caption text-muted">
        <span>
          <span className="text-subtle">—</span> sin calificar
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="size-1.5 rounded-full bg-warning" aria-hidden /> corte incompleto
        </span>
        <span>
          <span className="font-semibold text-danger">en rojo</span>, por debajo de 3.0
        </span>
        <span>
          4.00<span className="align-super text-caption">2</span> promedio de varias notas
        </span>
        <span className="ml-auto">Toca un estudiante para ver su desglose y registrar notas.</span>
      </footer>
    </section>
  );
}
