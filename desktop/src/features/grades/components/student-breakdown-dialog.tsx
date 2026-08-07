import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  ConfirmDialog,
  Dialog,
  DialogContent,
  EmptyState,
} from '@/shared/ui';
import { formatGrade } from '@/shared/lib/format';
import { useDeleteGrade } from '@/features/grades/hooks/use-grades';
import type {
  ComponentType,
  ConsolidatedRow,
  GradeDetail,
} from '@/domain/schemas/academic';

/**
 * Desglose de un estudiante: de qué notas sale cada promedio.
 *
 * El consolidado responde «cuánto sacó»; esto responde «por qué». Sin ello un
 * componente era un número y un contador —«Trabajos 4.2, 3 notas»— y corregir
 * el taller mal digitado obligaba a adivinar cuál de los tres era.
 *
 * El promedio de un componente es la suma de sus notas dividida por cuántas
 * hay, así que se muestra la cuenta explícita: es la forma más rápida de ver
 * que falta una o que sobra la que se cargó dos veces.
 */

const COMPONENT_LABELS: Record<ComponentType, string> = {
  TRABAJOS: 'Trabajos',
  PARCIALES: 'Parciales',
  AUTOEVALUACION: 'Autoevaluación',
};

export function StudentBreakdownDialog({
  row,
  onOpenChange,
  canWrite,
}: {
  row: ConsolidatedRow | null;
  onOpenChange: (open: boolean) => void;
  canWrite: boolean;
}) {
  const deleteGrade = useDeleteGrade();
  const [borrando, setBorrando] = useState<GradeDetail | null>(null);

  return (
    <>
      <Dialog open={row !== null} onOpenChange={onOpenChange}>
        <DialogContent
          title={row?.fullName ?? 'Desglose'}
          description={
            row ? `${row.code} · nota final ${formatGrade(row.notaFinal)}` : undefined
          }
          className="max-w-2xl"
        >
          {row && row.cortes.some((corte) => corte.componentes.some((c) => c.registros > 0)) ? (
            <div className="flex flex-col gap-5">
              {row.cortes.map((corte) => (
                <section key={corte.corte} className="flex flex-col gap-2">
                  <header className="flex items-baseline justify-between gap-2">
                    <h3 className="text-body font-semibold text-text">
                      Corte {corte.corte}
                      <span className="ml-2 text-caption font-normal text-muted">
                        {Math.round(corte.peso * 100)}% de la final
                      </span>
                    </h3>
                    <span className="font-mono tabular-nums text-body text-text">
                      {formatGrade(corte.nota)}
                    </span>
                  </header>

                  {corte.componentes.map((componente) => (
                    <div
                      key={componente.tipo}
                      className="rounded-lg border border-border bg-surface-alt/50 p-3"
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="text-caption font-semibold text-text">
                          {COMPONENT_LABELS[componente.tipo]}
                          <span className="ml-1.5 font-normal text-muted">
                            {Math.round(componente.peso * 100)}%
                          </span>
                        </span>
                        {componente.registros > 0 ? (
                          <span className="font-mono text-caption tabular-nums text-muted">
                            {/* La cuenta explícita: promedio = suma / cantidad. */}
                            {componente.notas.map((n) => formatGrade(n.score)).join(' + ')}
                            {' ÷ '}
                            {componente.registros}
                            {' = '}
                            <span className="font-semibold text-text">
                              {formatGrade(componente.promedio)}
                            </span>
                          </span>
                        ) : (
                          <Badge tone="warning">Sin calificar</Badge>
                        )}
                      </div>

                      {componente.notas.length > 0 ? (
                        <ul className="mt-2 flex flex-col gap-1">
                          {componente.notas.map((nota) => (
                            <li
                              key={nota.id}
                              className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-surface-hover"
                            >
                              <span className="min-w-0 flex-1 truncate text-caption text-text">
                                {nota.label}
                              </span>
                              <span className="font-mono text-caption tabular-nums text-text">
                                {formatGrade(nota.score)}
                              </span>
                              {canWrite ? (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  aria-label={`Eliminar ${nota.label}`}
                                  onClick={() => setBorrando(nota)}
                                >
                                  <Trash2 className="size-3.5 text-danger" aria-hidden />
                                </Button>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ))}
                </section>
              ))}
            </div>
          ) : (
            <EmptyState
              title="Todavía sin notas"
              message="Cuando registres la primera nota de este estudiante, aquí verás de qué se compone cada corte."
            />
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={borrando !== null}
        onOpenChange={(open) => !open && setBorrando(null)}
        title="¿Eliminar esta nota?"
        description={
          borrando
            ? `Se elimina «${borrando.label}» (${formatGrade(borrando.score)}). El promedio del componente se recalcula sin ella, y con él la nota del corte y la final.`
            : ''
        }
        confirmLabel="Eliminar"
        loading={deleteGrade.isPending}
        onConfirm={() => {
          if (!borrando) return;
          deleteGrade.mutate(borrando.id, { onSuccess: () => setBorrando(null) });
        }}
      />
    </>
  );
}
