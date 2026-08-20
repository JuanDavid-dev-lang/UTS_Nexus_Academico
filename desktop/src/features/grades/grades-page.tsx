import { useEffect, useMemo, useState } from 'react';
import {
  CalendarRange,
  CheckCircle2,
  FileUp,
  ListChecks,
  ListTree,
  Plus,
  Save,
  Sigma,
  XCircle,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  DataTable,
  Dialog,
  DialogContent,
  DialogFooter,
  EmptyState,
  ErrorState,
  Field,
  GradeBadge,
  Input,
  NativeSelect,
  PageContainer,
  PageHeader,
  SkeletonTable,
  StatCard,
  type Column,
} from '@/shared/ui';
import {
  useConsolidated,
  useEnrolledStudents,
  useSaveGrade,
} from '@/features/grades/hooks/use-grades';
import { GradesImportDialog } from '@/features/grades/components/grades-import-dialog';
import { PendingGradesCard } from '@/features/grades/components/pending-grades-card';
import { StudentBreakdownDialog } from '@/features/grades/components/student-breakdown-dialog';
import { useSubjects } from '@/features/subjects/hooks/use-subjects';
import { useCurrentUser, useUserRole } from '@/state/session.store';
import { can } from '@/core/auth/permissions';
import { currentPeriod, formatGrade, recentPeriods } from '@/shared/lib/format';
import type { ConsolidatedRow, CutNumber, ComponentType } from '@/domain/schemas/academic';

/**
 * Grade capture and consolidated view.
 *
 * The final mark is NEVER computed here. The client posts individual component
 * scores and reads back what the backend's canonical engine produced - two
 * implementations of the same rubric would eventually disagree, and the one
 * students see has to be the authoritative one.
 */

const COMPONENT_LABELS: Record<ComponentType, string> = {
  TRABAJOS: 'Trabajos (30%)',
  PARCIALES: 'Parciales (60%)',
  AUTOEVALUACION: 'Autoevaluación (10%)',
};

const CUTS: CutNumber[] = [1, 2, 3];

export default function GradesPage() {
  const [period, setPeriod] = useState(currentPeriod());
  const [subjectId, setSubjectId] = useState('');
  const [captureOpen, setCaptureOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [desglose, setDesglose] = useState<ConsolidatedRow | null>(null);

  const user = useCurrentUser();
  const role = useUserRole();
  const canWrite = can(role, 'grades.write');

  const subjects = useSubjects();
  const consolidated = useConsolidated({ period, subjectId: subjectId || undefined }, true);
  const enrolled = useEnrolledStudents({ subjectId, period });
  const saveGrade = useSaveGrade();

  // Default to the first subject of the selected period so the page is useful
  // immediately instead of showing an empty selector.
  useEffect(() => {
    if (subjectId) return;
    const first = subjects.data?.find((subject) => subject.period === period);
    if (first) setSubjectId(first._id);
  }, [subjects.data, period, subjectId]);

  const periodSubjects = useMemo(
    () => (subjects.data ?? []).filter((subject) => subject.period === period),
    [subjects.data, period],
  );

  const rows = consolidated.data ?? [];
  const materiaActiva = periodSubjects.find((subject) => subject._id === subjectId);

  const stats = useMemo(() => {
    if (rows.length === 0) return { average: 0, passing: 0, failing: 0, complete: 0 };

    const average = rows.reduce((sum, row) => sum + row.notaFinal, 0) / rows.length;
    return {
      average,
      passing: rows.filter((row) => row.aprobado).length,
      failing: rows.filter((row) => !row.aprobado).length,
      complete: rows.filter((row) => row.completo).length,
    };
  }, [rows]);

  const columns = useMemo<Column<ConsolidatedRow>[]>(
    () => [
      {
        key: 'student',
        header: 'Estudiante',
        width: '2fr',
        sortValue: (row) => row.fullName,
        cell: (row) => (
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-medium">{row.fullName}</span>
            <span className="truncate font-mono text-caption text-muted">{row.code}</span>
          </div>
        ),
      },
      ...CUTS.map<Column<ConsolidatedRow>>((cut) => ({
        key: `cut-${cut}`,
        header: `Corte ${cut}`,
        width: '1fr',
        align: 'center',
        sortValue: (row) => row.cortes.find((item) => item.corte === cut)?.nota ?? 0,
        cell: (row) => {
          const summary = row.cortes.find((item) => item.corte === cut);
          if (!summary) return <span className="text-subtle">—</span>;
          return (
            /*
              Un corte incompleto se marcaba en cursiva y gris. La cursiva no
              dice qué le pasa a ese número —se lee como énfasis— y el gris lo
              confunde con un dato ausente, cuando la nota está y es correcta:
              lo que falta son componentes por calificar. El punto ámbar sí lo
              dice, y no cambia el peso ni el color de la cifra.
            */
            <span
              className="inline-flex items-center justify-center gap-1 font-mono tabular"
              title={summary.completo ? 'Corte completo' : 'Faltan componentes por calificar'}
            >
              {formatGrade(summary.nota)}
              {summary.completo ? null : (
                <span className="size-1.5 shrink-0 rounded-full bg-warning" aria-hidden />
              )}
              {summary.completo ? null : <span className="sr-only">Corte incompleto</span>}
            </span>
          );
        },
      })),
      {
        key: 'final',
        header: 'Nota final',
        width: '1fr',
        align: 'center',
        sortValue: (row) => row.notaFinal,
        cell: (row) => <GradeBadge value={row.notaFinal} />,
      },
      {
        key: 'status',
        header: 'Estado',
        width: '1fr',
        align: 'center',
        sortValue: (row) => (row.completo ? 1 : 0),
        cell: (row) =>
          row.completo ? (
            <Badge tone="success">Completo</Badge>
          ) : (
            <Badge tone="warning">En curso</Badge>
          ),
      },
      {
        key: 'breakdown',
        header: '',
        width: '48px',
        align: 'center',
        cell: (row) => (
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Ver el desglose de ${row.fullName}`}
            onClick={() => setDesglose(row)}
          >
            <ListTree className="size-4" aria-hidden />
          </Button>
        ),
      },
    ],
    [],
  );

  return (
    <PageContainer>
      <PageHeader
        // Periodo y materia son el contexto de todo lo que hay debajo: sin
        // ellos a la vista, una tabla de doce filas puede ser el grupo entero o
        // un resto de otro semestre y no hay forma de saberlo sin bajar a los
        // desplegables.
        eyebrow={
          <>
            <CalendarRange className="size-3.5" aria-hidden />
            {period}
            {materiaActiva ? ` · ${materiaActiva.name}` : ' · Todas las materias'}
          </>
        }
        title="Notas"
        subtitle="Captura por componente; el consolidado lo calcula el motor académico"
        actions={
          canWrite ? (
            <>
              <Button variant="secondary" onClick={() => setImportOpen(true)}>
                <FileUp aria-hidden />
                Importar notas
              </Button>
              <Button
                variant="primary"
                onClick={() => setCaptureOpen(true)}
                disabled={!subjectId || enrolled.data.length === 0}
              >
                <Plus aria-hidden />
                Registrar nota
              </Button>
            </>
          ) : null
        }
      />

      {canWrite && <GradesImportDialog open={importOpen} onOpenChange={setImportOpen} />}

      {/* Los filtros van en un pozo: son lo que acota la tabla de abajo, y
          sueltos sobre el fondo parecían dos campos de un formulario. */}
      <div className="surface-well flex flex-wrap items-end gap-3 p-3">
        <Field label="Periodo" className="w-40">
          {(props) => (
            <NativeSelect
              {...props}
              value={period}
              onChange={(event) => {
                setPeriod(event.target.value);
                setSubjectId('');
              }}
            >
              {recentPeriods(6).map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>

        <Field label="Materia" className="min-w-64 flex-1 max-w-sm">
          {(props) => (
            <NativeSelect
              {...props}
              value={subjectId}
              onChange={(event) => setSubjectId(event.target.value)}
              disabled={periodSubjects.length === 0}
            >
              <option value="">Todas las materias</option>
              {periodSubjects.map((subject) => (
                <option key={subject._id} value={subject._id}>
                  {subject.name} ({subject.code})
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>
      </div>

      {/*
        Las cuatro métricas usan el mismo componente que el panel.
        Antes eran cuatro `Card` montadas a mano con `CardTitle` forzado a
        `text-h3` y una `Progress` dentro: la misma información que el panel
        muestra con `StatCard`, pintada de otra manera. Dos formas de dibujar
        «una cifra con su contexto» en la misma aplicación es exactamente el
        problema que el sistema de diseño existe para no tener.
      */}
      {rows.length > 0 ? (
        <div className="grid grid-cols-2 gap-4 @3xl:grid-cols-4">
          <StatCard
            index={0}
            label="Promedio del grupo"
            value={formatGrade(stats.average)}
            hint="Sobre 5.0"
            tone={stats.average >= 3 ? 'success' : 'danger'}
            icon={Sigma}
            progress={(stats.average / 5) * 100}
          />
          <StatCard
            index={1}
            label="Aprobando"
            value={stats.passing}
            hint={`de ${rows.length} estudiantes`}
            tone="success"
            icon={CheckCircle2}
            progress={(stats.passing / rows.length) * 100}
          />
          <StatCard
            index={2}
            label="Reprobando"
            value={stats.failing}
            hint={`de ${rows.length} estudiantes`}
            tone="danger"
            icon={XCircle}
            progress={(stats.failing / rows.length) * 100}
          />
          <StatCard
            index={3}
            label="Cortes completos"
            value={`${stats.complete} / ${rows.length}`}
            hint="Con los 3 cortes calificados"
            tone="primary"
            icon={ListChecks}
            progress={(stats.complete / rows.length) * 100}
          />
        </div>
      ) : null}

      {/* Antes de la tabla: en la semana de cierre, "qué me falta" pesa más que
          "cuánto sacó cada uno". */}
      <PendingGradesCard period={period} subjectId={subjectId || undefined} />

      {consolidated.isPending ? (
        <SkeletonTable rows={8} columns={6} />
      ) : consolidated.isError ? (
        <Card>
          <ErrorState error={consolidated.error} onRetry={() => void consolidated.refetch()} />
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            title="Sin notas en este periodo"
            message="Cuando registres la primera nota, el consolidado aparecerá aquí calculado con la rúbrica 30/60/10."
          />
        </Card>
      ) : (
        <DataTable rows={rows} columns={columns} getRowId={(row) => row.studentId} />
      )}

      <GradeCaptureDialog
        open={captureOpen}
        onOpenChange={setCaptureOpen}
        period={period}
        subjectId={subjectId}
        teacherId={user?.id ?? ''}
        students={enrolled.data}
        onSave={(input) => saveGrade.mutate(input, { onSuccess: () => setCaptureOpen(false) })}
        saving={saveGrade.isPending}
      />

      {/* La fila del consolidado dice cuánto sacó; esto, de qué notas salió. */}
      <StudentBreakdownDialog
        row={desglose}
        onOpenChange={(open) => !open && setDesglose(null)}
        canWrite={canWrite}
      />
    </PageContainer>
  );
}

/** Capture dialog for a single component score inside a cut. */
function GradeCaptureDialog({
  open,
  onOpenChange,
  period,
  subjectId,
  teacherId,
  students,
  onSave,
  saving,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  period: string;
  subjectId: string;
  teacherId: string;
  students: { _id: string; fullName: string; code: string }[];
  onSave: (input: {
    studentId: string;
    subjectId: string;
    teacherId: string;
    corte: CutNumber;
    componentType: ComponentType;
    label: string;
    score: number;
    period: string;
  }) => void;
  saving: boolean;
}) {
  const [studentId, setStudentId] = useState('');
  const [cut, setCut] = useState<CutNumber>(1);
  const [component, setComponent] = useState<ComponentType>('PARCIALES');
  const [label, setLabel] = useState('');
  const [score, setScore] = useState('');
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!open) return;
    setStudentId(students[0]?._id ?? '');
    setLabel('');
    setScore('');
    setError(undefined);
  }, [open, students]);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const numericScore = Number(score.replace(',', '.'));
    if (!studentId) return setError('Selecciona un estudiante.');
    if (!Number.isFinite(numericScore)) return setError('La nota debe ser un número.');
    if (numericScore < 0 || numericScore > 5) return setError('La nota debe estar entre 0.0 y 5.0.');

    setError(undefined);
    onSave({
      studentId,
      subjectId,
      teacherId,
      corte: cut,
      componentType: component,
      label: label.trim() || 'Nota',
      score: numericScore,
      period,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Registrar nota"
        description="La nota del corte se recalcula automáticamente con la rúbrica institucional."
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          <Field label="Estudiante" required>
            {(props) => (
              <NativeSelect
                {...props}
                value={studentId}
                onChange={(event) => setStudentId(event.target.value)}
              >
                {students.map((student) => (
                  <option key={student._id} value={student._id}>
                    {student.fullName} — {student.code}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Corte" required>
              {(props) => (
                <NativeSelect
                  {...props}
                  value={cut}
                  onChange={(event) => setCut(Number(event.target.value) as CutNumber)}
                >
                  {CUTS.map((option) => (
                    <option key={option} value={option}>
                      Corte {option}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>

            <Field label="Componente" required>
              {(props) => (
                <NativeSelect
                  {...props}
                  value={component}
                  onChange={(event) => setComponent(event.target.value as ComponentType)}
                >
                  {(Object.keys(COMPONENT_LABELS) as ComponentType[]).map((option) => (
                    <option key={option} value={option}>
                      {COMPONENT_LABELS[option]}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Descripción" hint="Opcional: “Parcial 1”, “Taller 3”…">
              {(props) => (
                <Input
                  {...props}
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                  placeholder="Nota"
                />
              )}
            </Field>

            <Field label="Nota (0.0 – 5.0)" error={error} required>
              {(props) => (
                <Input
                  {...props}
                  inputMode="decimal"
                  value={score}
                  onChange={(event) => setScore(event.target.value)}
                  placeholder="3.5"
                  className="font-mono"
                />
              )}
            </Field>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" loading={saving}>
              <Save aria-hidden />
              Guardar nota
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
