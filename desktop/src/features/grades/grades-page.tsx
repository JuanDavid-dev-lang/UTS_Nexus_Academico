import { useEffect, useMemo, useState } from 'react';
import {
  CalendarRange,
  CheckCircle2,
  FileUp,
  ListChecks,
  ListTree,
  Plus,
  Sigma,
  XCircle,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  DataTable,
  EmptyState,
  ErrorState,
  Field,
  GradeBadge,
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
} from '@/features/grades/hooks/use-grades';
import { GradesImportDialog } from '@/features/grades/components/grades-import-dialog';
import { PendingGradesCard } from '@/features/grades/components/pending-grades-card';
import { StudentBreakdownDialog } from '@/features/grades/components/student-breakdown-dialog';
import { useSubjects } from '@/features/subjects/hooks/use-subjects';
import { useCurrentUser, useUserRole } from '@/state/session.store';
import { can } from '@/core/auth/permissions';
import { currentPeriod, formatGrade, recentPeriods } from '@/shared/lib/format';
import type { ConsolidatedRow, CutNumber } from '@/domain/schemas/academic';

/**
 * Grade capture and consolidated view.
 *
 * The final mark is NEVER computed here. The client posts individual component
 * scores and reads back what the backend's canonical engine produced - two
 * implementations of the same rubric would eventually disagree, and the one
 * students see has to be the authoritative one.
 */

const CUTS: CutNumber[] = [1, 2, 3];

export default function GradesPage() {
  const [period, setPeriod] = useState(currentPeriod());
  const [subjectId, setSubjectId] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  // Se guarda el ID y no la fila: la fila es una foto, y el desglose ahora
  // también registra notas — con la foto, cada nota añadida no se vería hasta
  // cerrar y volver a abrir. Con el ID, la fila se re-deriva del consolidado
  // fresco en cada render.
  const [desgloseId, setDesgloseId] = useState<string | null>(null);

  const user = useCurrentUser();
  const role = useUserRole();
  const canWrite = can(role, 'grades.write');

  const subjects = useSubjects();
  const consolidated = useConsolidated({ period, subjectId: subjectId || undefined }, true);
  const enrolled = useEnrolledStudents({ subjectId, period });

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

  // La fila viva del estudiante abierto (null si aún no tiene notas) y su
  // identidad, que para un estudiante sin notas sale de la matrícula.
  const desgloseRow = rows.find((row) => row.studentId === desgloseId) ?? null;
  const desgloseStudent = desgloseId
    ? desgloseRow ??
      (() => {
        const enrolledStudent = enrolled.data.find((student) => student._id === desgloseId);
        return enrolledStudent
          ? { studentId: enrolledStudent._id, code: enrolledStudent.code, fullName: enrolledStudent.fullName }
          : null;
      })()
    : null;

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
            onClick={() => setDesgloseId(row.studentId)}
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
                // Abre el menú completo del primer matriculado: el desglose es
                // ahora donde se registra, con cada componente y sus subnotas
                // a la vista y un selector para cambiar de estudiante.
                onClick={() => setDesgloseId(enrolled.data[0]?._id ?? null)}
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

      {/* La fila del consolidado dice cuánto sacó; esto, de qué notas salió —
          y es donde se registran las nuevas, componente por componente. */}
      <StudentBreakdownDialog
        open={desgloseId !== null}
        onOpenChange={(next) => !next && setDesgloseId(null)}
        student={desgloseStudent}
        row={desgloseRow}
        {...(canWrite && enrolled.data.length > 0
          ? { students: enrolled.data, onSelectStudent: setDesgloseId }
          : {})}
        canWrite={canWrite}
        {...(canWrite && subjectId && user
          ? { capture: { subjectId, teacherId: user.id, period } }
          : {})}
      />
    </PageContainer>
  );
}
