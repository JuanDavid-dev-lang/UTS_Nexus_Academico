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
import { cn } from '@/shared/lib/cn';
import { useDeleteGrade, useSaveGrade } from '@/features/grades/hooks/use-grades';
import type {
  ComponentType,
  ConsolidatedRow,
  CutNumber,
  EstructuraNotas,
  GradeDetail,
  NotaPlantilla,
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

/** Fracción del componente que representa cada nota, por si el servidor no la mandó. */
function fraccionesDe(notas: GradeDetail[]): number[] {
  const suma = notas.reduce((total, n) => total + (n.weight ?? 1), 0);
  return notas.map((n) => n.pesoRelativo ?? (suma > 0 ? (n.weight ?? 1) / suma : 0));
}

function pesosIguales(notas: GradeDetail[]): boolean {
  const primero = notas[0]?.weight ?? 1;
  return notas.every((n) => (n.weight ?? 1) === primero);
}

/**
 * La cuenta explícita del promedio. Con todos los pesos iguales es la de
 * siempre —suma ÷ cantidad—; con pesos distintos, cada nota por su fracción.
 */
function formulaDe(notas: GradeDetail[]): string {
  if (pesosIguales(notas)) {
    return `${notas.map((n) => formatGrade(n.score)).join(' + ')} ÷ ${notas.length}`;
  }
  const fracciones = fraccionesDe(notas);
  return notas
    .map((n, i) => `${formatGrade(n.score)}×${Math.round((fracciones[i] ?? 0) * 100)}%`)
    .join(' + ');
}

/** Notas de la plantilla que este estudiante todavía no tiene en ese componente del corte. */
function pendientesDe(
  estructura: EstructuraNotas | null | undefined,
  corte: number,
  tipo: ComponentType,
  existentes: GradeDetail[],
): NotaPlantilla[] {
  const componente = estructura?.cortes
    .find((c) => c.corte === corte)
    ?.componentes.find((c) => c.tipo === tipo);
  if (!componente) return [];
  const usadas = new Set(existentes.map((n) => n.label.trim().toLocaleLowerCase('es')));
  return componente.notas.filter((n) => !usadas.has(n.label.trim().toLocaleLowerCase('es')));
}

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
  estructura,
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
  /** Plantilla aplicada al grupo: propone lo que falta y su peso. */
  estructura?: EstructuraNotas | null;
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
            {cortes.map((corte, indice) => {
              /*
                Los cortes se capturan en orden: el renglón de añadir del corte
                N se habilita cuando el N-1 está completo. El «completo» lo
                declara el backend en el resumen — aquí solo se lee; y el
                backend además lo exige en el POST, así que esto es cortesía,
                no la barrera.
              */
              const anterior = indice > 0 ? cortes[indice - 1] : null;
              const corteAbierto = indice === 0 || Boolean(anterior?.completo ?? false);
              return (
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
                          {/* La cuenta explícita: suma ÷ cantidad, o cada nota por su peso. */}
                          {formulaDe(componente.notas)}
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
                        {componente.notas.map((nota, indice) => (
                          <li
                            key={nota.id}
                            className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-surface-hover"
                          >
                            <span className="min-w-0 flex-1 truncate text-caption text-text">
                              {nota.label}
                            </span>
                            {/* El peso solo se muestra cuando no son todos iguales: con
                                promedio simple «33 %» en cada fila es ruido. */}
                            {pesosIguales(componente.notas) ? null : (
                              <span className="font-mono text-caption tabular-nums text-subtle">
                                {Math.round((fraccionesDe(componente.notas)[indice] ?? 0) * 100)}%
                              </span>
                            )}
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

                    {puedeRegistrar && corteAbierto ? (
                      <InlineAddNote
                        studentId={student.studentId}
                        corte={corte.corte as CutNumber}
                        componentType={componente.tipo}
                        capture={capture}
                        pendientes={pendientesDe(estructura, corte.corte, componente.tipo, componente.notas)}
                      />
                    ) : null}
                  </div>
                ))}

                {puedeRegistrar && !corteAbierto ? (
                  <p className="text-caption text-muted">
                    Se habilita al completar los tres componentes del corte {corte.corte - 1}.
                  </p>
                ) : null}
              </section>
              );
            })}
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
  pendientes,
}: {
  studentId: string;
  corte: CutNumber;
  componentType: ComponentType;
  capture: CaptureScope;
  /** Lo que la plantilla del grupo dice que falta aquí. */
  pendientes: NotaPlantilla[];
}) {
  const saveGrade = useSaveGrade();
  const [label, setLabel] = useState('');
  const [score, setScore] = useState('');
  // Peso relativo. Vacío = que lo decida el servidor (plantilla o 1).
  const [peso, setPeso] = useState('');
  const [error, setError] = useState<string>();

  function guardar() {
    const numero = Number(score.replace(',', '.'));
    const pesoNumero = peso.trim() ? Number(peso.replace(',', '.')) : undefined;
    if (!label.trim()) return setError('Escribe qué actividad fue.');
    if (!Number.isFinite(numero)) return setError('La nota debe ser un número.');
    if (numero < 0 || numero > 5) return setError('Entre 0.0 y 5.0.');
    if (pesoNumero !== undefined && (!Number.isFinite(pesoNumero) || pesoNumero <= 0 || pesoNumero > 1000)) {
      return setError('El peso debe ser un número mayor que 0.');
    }

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
        ...(pesoNumero !== undefined ? { weight: pesoNumero } : {}),
      },
      {
        onSuccess() {
          setLabel('');
          setScore('');
          setPeso('');
        },
      },
    );
  }

  return (
    <div className="mt-2 flex flex-col gap-1.5">
      {/* La plantilla propone; no obliga. Tocar una rellena nombre y peso y
          deja solo la nota por escribir, que es lo único que el docente sabe
          y el sistema no. */}
      {pendientes.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5" aria-label="Pendientes según la plantilla">
          <span className="text-caption text-subtle">Faltan:</span>
          {pendientes.map((nota) => (
            <button
              key={nota.label}
              type="button"
              onClick={() => {
                setLabel(nota.label);
                setPeso(String(nota.weight));
              }}
              className={cn(
                'rounded-full border border-dashed border-border px-2 py-0.5 text-caption text-muted',
                'transition-colors hover:border-primary hover:bg-primary-soft hover:text-primary',
                label === nota.label && 'border-solid border-primary bg-primary-soft text-primary',
              )}
            >
              {nota.label}
            </button>
          ))}
        </div>
      ) : null}
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
        <Input
          value={peso}
          onChange={(event) => setPeso(event.target.value)}
          placeholder="Peso"
          inputMode="decimal"
          aria-label="Peso relativo dentro del componente (opcional)"
          title="Peso relativo dentro del componente. Vacío: el de la plantilla, o 1. Ejemplo: teórico 60 y práctico 40."
          className="h-8 w-16 text-caption"
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
