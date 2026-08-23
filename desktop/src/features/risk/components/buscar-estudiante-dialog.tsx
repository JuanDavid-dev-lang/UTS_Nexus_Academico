import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Search, UserSearch } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  Input,
  NoResultsState,
  RiskBadge,
  SkeletonList,
} from '@/shared/ui';
import { queryKeys } from '@/core/api/query-keys';
import { studentRepository } from '@/infrastructure/repositories/students.repository';
import { timelineRepository } from '@/infrastructure/repositories/activities.repository';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { formatGrade, formatPercent } from '@/shared/lib/format';
import type { RiskLevel } from '@/domain/schemas/common';
import type { StudentDirectoryEntry } from '@/domain/schemas/students';
import type { RiskItem } from '@/domain/schemas/risk';

/**
 * Abrir un seguimiento a alguien que el tablero no listó.
 *
 * `GET /analytics/risks` descarta el nivel BAJO y corta en 50 casos, así que el
 * buscador de la tabla solo encuentra lo que ya estaba señalado. Un docente que
 * ve venir un problema —dejó de participar, avisó de una situación personal—
 * no tiene forma de registrar nada hasta que las notas caigan lo suficiente,
 * que es justo cuando ya es tarde. Este diálogo llega a cualquier estudiante
 * del alcance del docente.
 *
 * Son dos pasos y no uno porque el seguimiento se abre sobre una MATERIA, no
 * sobre una persona: el mismo estudiante puede ir bien en una y mal en otra, y
 * el acompañamiento de cada una lo lleva quien la dicta.
 */

/** El expediente habla en español; `RiskItem` en inglés. Traducción en un sitio. */
const NIVEL: Record<string, RiskLevel> = {
  ALTO: 'HIGH',
  MEDIO: 'MEDIUM',
  BAJO: 'LOW',
};

export function BuscarEstudianteDialog({
  open,
  onOpenChange,
  onElegir,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onElegir: (row: RiskItem) => void;
}) {
  const [termino, setTermino] = useState('');
  const [elegido, setElegido] = useState<{ id: string; fullName: string; code: string } | null>(
    null,
  );
  const consulta = useDebounce(termino.trim(), 250);

  function cerrar() {
    setTermino('');
    setElegido(null);
    onOpenChange(false);
  }

  const resultados = useQuery({
    queryKey: queryKeys.students.search(consulta),
    queryFn: () => studentRepository.search(consulta),
    // Tres caracteres: es el mínimo que exige el backend, y el repositorio ya
    // corta por debajo. Pedirlo aquí evita una consulta que sabemos vacía.
    enabled: open && consulta.length >= 3 && elegido === null,
  });

  const expediente = useQuery({
    queryKey: [...queryKeys.timeline.student(elegido?.id ?? '', {}), 'materias'],
    queryFn: () => timelineRepository.seguimiento(elegido!.id, { limit: 1 }),
    enabled: elegido !== null,
  });

  return (
    <Dialog open={open} onOpenChange={(next) => !next && cerrar()}>
      <DialogContent
        title={elegido ? elegido.fullName : 'Buscar estudiante'}
        description={
          elegido
            ? 'Elige la materia sobre la que abrirás el seguimiento.'
            : 'Abre un seguimiento a cualquier estudiante, esté o no en la lista de riesgo.'
        }
        className="max-w-xl"
      >
        {elegido === null ? (
          <div className="flex flex-col gap-3">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle"
                aria-hidden
              />
              <Input
                autoFocus
                value={termino}
                onChange={(event) => setTermino(event.target.value)}
                placeholder="Nombre o cédula"
                aria-label="Buscar estudiante por nombre o cédula"
                className="pl-9"
              />
            </div>

            {consulta.length < 3 ? (
              <p className="py-8 text-center text-caption text-muted">
                Escribe al menos tres caracteres.
              </p>
            ) : resultados.isPending ? (
              <SkeletonList rows={4} />
            ) : (resultados.data?.length ?? 0) === 0 ? (
              <NoResultsState query={consulta} onClear={() => setTermino('')} />
            ) : (
              <ul className="flex max-h-80 flex-col gap-1 overflow-y-auto">
                {resultados.data!.map((estudiante: StudentDirectoryEntry) => (
                  <li key={estudiante._id}>
                    <button
                      type="button"
                      onClick={() =>
                        setElegido({
                          id: estudiante._id,
                          fullName: estudiante.fullName,
                          code: estudiante.code,
                        })
                      }
                      className="flex w-full items-center gap-3 rounded-lg border border-transparent px-3 py-2 text-left hover:border-border hover:bg-surface-alt focus-visible:border-border focus-visible:bg-surface-alt"
                    >
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-body font-medium text-text">
                          {estudiante.fullName}
                        </span>
                        <span className="truncate font-mono text-caption text-muted">
                          {estudiante.code}
                          {estudiante.program ? ` · ${estudiante.program}` : ''}
                        </span>
                      </span>
                      <ChevronRight className="size-4 shrink-0 text-subtle" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : expediente.isPending ? (
          <SkeletonList rows={3} />
        ) : (expediente.data?.academic.length ?? 0) === 0 ? (
          <EmptyMaterias onVolver={() => setElegido(null)} />
        ) : (
          <div className="flex flex-col gap-2">
            {expediente.data!.academic.map((registro) => (
              <button
                key={`${registro.subjectId}-${registro.period}`}
                type="button"
                onClick={() => {
                  onElegir({
                    studentId: elegido.id,
                    code: elegido.code,
                    fullName: elegido.fullName,
                    subjectId: registro.subjectId,
                    notaFinal: registro.finalGrade,
                    attendanceRate: registro.attendancePercentage,
                    missed: registro.absences,
                    riskScore: registro.risk.score,
                    level: NIVEL[registro.risk.level] ?? 'LOW',
                    motivos: registro.risk.reasons,
                    interventionStatus: 'PENDIENTE',
                    interventionNote: '',
                    interventionAt: null,
                  });
                  cerrar();
                }}
                className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5 text-left hover:border-accent-secondary hover:bg-surface-alt focus-visible:border-accent-secondary"
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-body font-medium text-text">
                    {registro.subjectName ?? 'Materia sin nombre'}
                  </span>
                  <span className="truncate font-mono text-caption tabular-nums text-muted">
                    {registro.period} · nota {formatGrade(registro.finalGrade)} · asistencia{' '}
                    {formatPercent(registro.attendancePercentage)}
                  </span>
                </span>
                <RiskBadge level={NIVEL[registro.risk.level] ?? 'LOW'} />
                <ChevronRight className="size-4 shrink-0 text-subtle" aria-hidden />
              </button>
            ))}

            <button
              type="button"
              onClick={() => setElegido(null)}
              className="self-start text-caption font-semibold text-accent-strong hover:underline"
            >
              ← Buscar a otra persona
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function EmptyMaterias({ onVolver }: { onVolver: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-8 text-center">
      <UserSearch className="size-8 text-subtle" aria-hidden />
      <p className="text-body text-text">No compartes ninguna materia con esta persona.</p>
      <p className="max-w-sm text-caption text-muted">
        El seguimiento se abre sobre una materia que dictes. Si debería aparecer aquí, revisa que
        esté matriculada en tu grupo.
      </p>
      <button
        type="button"
        onClick={onVolver}
        className="text-caption font-semibold text-accent-strong hover:underline"
      >
        ← Buscar a otra persona
      </button>
    </div>
  );
}
