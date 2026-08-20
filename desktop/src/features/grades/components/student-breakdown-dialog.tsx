import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  ConfirmDialog,
  Dialog,
  DialogContent,
  Input,
  NativeSelect,
} from '@/shared/ui';
import { formatGrade } from '@/shared/lib/format';
import { useDeleteGrade, useSaveGrade } from '@/features/grades/hooks/use-grades';
import type {
  ComponentType,
  ConsolidatedRow,
  CutNumber,
  GradeDetail,
} from '@/domain/schemas/academic';

/**
 * Desglose de un estudiante — y el sitio donde se registran sus notas.
 *
 * El consolidado responde «cuánto sacó»; esto responde «por qué» y permite
 * actuar: cada componente muestra sus subnotas con nombre, la cuenta explícita
 * (3.5 + 2.5 ÷ 2 = 3.0) y un renglón para añadir la siguiente ahí mismo.
 * Antes registrar era un formulario aparte —estudiante, corte, componente,
 * todo a ciegas— y ver el efecto obligaba a cerrar y buscar la fila: el
 * contexto y la acción vivían en pantallas distintas siendo la misma tarea.
 *
 * El promedio, la nota del corte y la final los calcula el backend; este
 * diálogo solo pinta el resumen que llega y envía notas nuevas.
 */

const COMPONENT_LABELS: Record<ComponentType, string> = {
  TRABAJOS: 'Trabajos',
  PARCIALES: 'Parciales',
  AUTOEVALUACION: 'Autoevaluación',
};

/**
 * Pesos de la rúbrica, solo para ROTULAR la estructura vacía de un estudiante
 * sin notas (el servidor aún no tiene nada que resumir de él). En cuanto
 * existe una nota, todo número mostrado viene del backend.
 */
const ESTRUCTURA_VACIA = {
  cortes: [1, 2, 3].map((corte) => ({
    corte,
    peso: corte === 3 ? 0.34 : 0.33,
    nota: 0,
    completo: false,
    componentes: (
      [
        ['TRABAJOS', 0.3],
        ['PARCIALES', 0.6],
        ['AUTOEVALUACION', 0.1],
      ] as [ComponentType, number][]
    ).map(([tipo, peso]) => ({ tipo, peso, promedio: 0, registros: 0, aporte: 0, notas: [] })),
  })),
};

export type BreakdownStudent = { studentId: string; code: string; fullName: string };

/** Contexto necesario para poder registrar desde el desglose. */
export type CaptureScope = { subjectId: string; teacherId: string; period: string };

export function StudentBreakdownDialog({
  open,
  onOpenChange,
  student,
  row,
  students,
  onSelectStudent,
  canWrite,
  capture,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Quién se está mirando. Puede no tener todavía ninguna nota. */
  student: BreakdownStudent | null;
  /** Su fila del consolidado, si existe. Null = aún sin notas. */
  row: ConsolidatedRow | null;
  /** Matriculados de la materia, para cambiar de estudiante sin cerrar. */
  students?: { _id: string; fullName: string; code: string }[];
  onSelectStudent?: (studentId: string) => void;
  canWrite: boolean;
  /** Sin esto el diálogo es solo lectura (falta materia, docente o periodo). */
  capture?: CaptureScope;
}) {
  const deleteGrade = useDeleteGrade();
  const [borrando, setBorrando] = useState<GradeDetail | null>(null);

  const cortes = row?.cortes.length ? row.cortes : ESTRUCTURA_VACIA.cortes;
  const puedeRegistrar = canWrite && !!capture && !!student;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          title={student?.fullName ?? 'Desglose'}
          description={
            student
              ? `${student.code}${row ? ` · nota final ${formatGrade(row.notaFinal)}` : ' · todavía sin notas'}`
              : undefined
          }
          className="max-w-2xl"
        >
          {students && students.length > 0 && onSelectStudent ? (
            <NativeSelect
              aria-label="Estudiante"
              value={student?.studentId ?? ''}
              onChange={(event) => onSelectStudent(event.target.value)}
              className="mb-1"
            >
              {students.map((item) => (
                <option key={item._id} value={item._id}>
                  {item.fullName} · {item.code}
                </option>
              ))}
            </NativeSelect>
          ) : null}

          <div className="flex flex-col gap-5">
            {cortes.map((corte) => (
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

                    {puedeRegistrar ? (
                      <InlineAddNote
                        studentId={student.studentId}
                        corte={corte.corte as CutNumber}
                        componentType={componente.tipo}
                        capture={capture}
                      />
                    ) : null}
                  </div>
                ))}
              </section>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={borrando !== null}
        onOpenChange={(next) => !next && setBorrando(null)}
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

/**
 * Renglón para añadir una nota dentro de su componente.
 *
 * El corte y el componente ya los dice el sitio donde está el renglón: solo
 * se piden las dos cosas que el docente sabe y el sistema no — qué actividad
 * fue y cuánto sacó. Tras guardar, los campos se limpian y el diálogo se
 * queda abierto: la fila del consolidado se refresca sola y lo normal es
 * seguir con la siguiente nota o el siguiente estudiante.
 */
function InlineAddNote({
  studentId,
  corte,
  componentType,
  capture,
}: {
  studentId: string;
  corte: CutNumber;
  componentType: ComponentType;
  capture: CaptureScope;
}) {
  const saveGrade = useSaveGrade();
  const [label, setLabel] = useState('');
  const [score, setScore] = useState('');
  const [error, setError] = useState<string>();

  function guardar() {
    const numero = Number(score.replace(',', '.'));
    if (!label.trim()) return setError('Escribe qué actividad fue.');
    if (!Number.isFinite(numero)) return setError('La nota debe ser un número.');
    if (numero < 0 || numero > 5) return setError('Entre 0.0 y 5.0.');

    setError(undefined);
    saveGrade.mutate(
      {
        studentId,
        subjectId: capture.subjectId,
        teacherId: capture.teacherId,
        corte,
        componentType,
        label: label.trim(),
        score: numero,
        period: capture.period,
      },
      {
        onSuccess() {
          setLabel('');
          setScore('');
        },
      },
    );
  }

  return (
    <div className="mt-2 flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <Input
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="Actividad (taller, quiz…)"
          aria-label={`Actividad nueva de ${COMPONENT_LABELS[componentType]} del corte ${corte}`}
          className="h-8 flex-1 text-caption"
          onKeyDown={(event) => event.key === 'Enter' && guardar()}
        />
        <Input
          value={score}
          onChange={(event) => setScore(event.target.value)}
          placeholder="0.0–5.0"
          inputMode="decimal"
          aria-label="Nota"
          className="h-8 w-20 text-caption"
          onKeyDown={(event) => event.key === 'Enter' && guardar()}
        />
        <Button
          variant="secondary"
          size="sm"
          loading={saveGrade.isPending}
          disabled={saveGrade.isPending}
          onClick={guardar}
        >
          <Plus className="size-3.5" aria-hidden />
          Añadir
        </Button>
      </div>
      {error ? <p className="text-caption text-danger">{error}</p> : null}
    </div>
  );
}
