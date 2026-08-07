import { useEffect, useMemo, useState } from 'react';
import { Plus, Save } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
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
  Progress,
  SkeletonTable,
  type Column,
} from '@/shared/ui';
import {
  useConsolidated,
  useEnrolledStudents,
  useSaveGrade,
} from '@/features/grades/hooks/use-grades';
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
          if (!summary) return <span className="text-muted">—</span>;
          return (
            <span
              className={
                summary.completo
                  ? 'font-mono tabular-nums'
                  : 'font-mono tabular-nums text-muted italic'
              }
              title={summary.completo ? 'Corte completo' : 'Faltan componentes por calificar'}
            >
              {formatGrade(summary.nota)}
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
    ],
    [],
  );

  return (
    <PageContainer>
      <PageHeader
        title="Notas"
        subtitle="Captura por componente; el consolidado lo calcula el motor académico"
        actions={
          canWrite ? (
            <Button
              variant="primary"
              onClick={() => setCaptureOpen(true)}
              disabled={!subjectId || enrolled.data.length === 0}
            >
              <Plus aria-hidden />
              Registrar nota
            </Button>
          ) : null
        }
      />

      <div className="flex flex-wrap items-end gap-3">
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

      {rows.length > 0 ? (
        <div className="grid gap-4 @3xl:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Promedio del grupo</CardDescription>
              <CardTitle className="font-mono text-h3">{formatGrade(stats.average)}</CardTitle>
            </CardHeader>
            <CardContent>
              <Progress
                value={(stats.average / 5) * 100}
                tone={stats.average >= 3 ? 'success' : 'danger'}
                label="Promedio del grupo sobre 5.0"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Aprobando</CardDescription>
              <CardTitle className="font-mono text-h3 text-success">{stats.passing}</CardTitle>
            </CardHeader>
            <CardContent>
              <Progress value={(stats.passing / rows.length) * 100} tone="success" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Reprobando</CardDescription>
              <CardTitle className="font-mono text-h3 text-danger">{stats.failing}</CardTitle>
            </CardHeader>
            <CardContent>
              <Progress value={(stats.failing / rows.length) * 100} tone="danger" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Con los 3 cortes completos</CardDescription>
              <CardTitle className="font-mono text-h3">
                {stats.complete}
                <span className="text-body text-muted"> / {rows.length}</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Progress value={(stats.complete / rows.length) * 100} tone="primary" />
            </CardContent>
          </Card>
        </div>
      ) : null}

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
