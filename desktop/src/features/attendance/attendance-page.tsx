import { useEffect, useMemo, useState } from 'react';
import { CalendarCheck, Check, X } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  ErrorState,
  Field,
  Input,
  NativeSelect,
  PageContainer,
  PageHeader,
  Progress,
  SkeletonList,
} from '@/shared/ui';
import { Avatar } from '@/shared/ui/primitives';
import { useAttendance, useMarkAttendance } from '@/features/attendance/hooks/use-attendance';
import { useEnrolledStudents } from '@/features/grades/hooks/use-grades';
import { useSubjects } from '@/features/subjects/hooks/use-subjects';
import { useCurrentUser, useUserRole } from '@/state/session.store';
import { can } from '@/core/auth/permissions';
import { currentPeriod, formatPercent, recentPeriods, toIsoDate } from '@/shared/lib/format';
import { cn } from '@/shared/lib/cn';
import { toast } from '@/state/toast.store';

/**
 * Attendance roll call.
 *
 * Built around the real workflow: pick a class, then tap through the list. Each
 * mark is saved immediately, so an interrupted session never loses the marks
 * already made - the v1 flow required a separate save step per student.
 */
export default function AttendancePage() {
  const [period, setPeriod] = useState(currentPeriod());
  const [subjectId, setSubjectId] = useState('');
  const [date, setDate] = useState(toIsoDate());

  const user = useCurrentUser();
  const role = useUserRole();
  const canWrite = can(role, 'attendance.write');

  const subjects = useSubjects();
  const enrolled = useEnrolledStudents({ subjectId, period });
  const attendance = useAttendance({ subjectId: subjectId || undefined, period }, Boolean(subjectId));
  const markAttendance = useMarkAttendance();

  useEffect(() => {
    if (subjectId) return;
    const first = subjects.data?.find((subject) => subject.period === period);
    if (first) setSubjectId(first._id);
  }, [subjects.data, period, subjectId]);

  const periodSubjects = useMemo(
    () => (subjects.data ?? []).filter((subject) => subject.period === period),
    [subjects.data, period],
  );

  /** Marks already registered for the selected date, keyed by student. */
  const marksForDate = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const record of attendance.data ?? []) {
      if (record.date.slice(0, 10) === date) map.set(record.studentId, record.present);
    }
    return map;
  }, [attendance.data, date]);

  /** Overall attendance rate per student across the whole period. */
  const ratesByStudent = useMemo(() => {
    const totals = new Map<string, { present: number; total: number }>();
    for (const record of attendance.data ?? []) {
      const current = totals.get(record.studentId) ?? { present: 0, total: 0 };
      current.total += 1;
      if (record.present) current.present += 1;
      totals.set(record.studentId, current);
    }

    const rates = new Map<string, number>();
    for (const [studentId, { present, total }] of totals) {
      rates.set(studentId, total > 0 ? (present / total) * 100 : 0);
    }
    return rates;
  }, [attendance.data]);

  const registeredCount = marksForDate.size;
  const presentCount = [...marksForDate.values()].filter(Boolean).length;

  function mark(studentId: string, present: boolean) {
    if (!user || !subjectId) return;
    markAttendance.mutate({
      studentId,
      subjectId,
      teacherId: user.id,
      period,
      date: new Date(`${date}T12:00:00`).toISOString(),
      present,
    });
  }

  function markAllPresent() {
    if (!user || !subjectId) return;
    const pending = enrolled.data.filter((student) => !marksForDate.has(student._id));
    if (pending.length === 0) {
      toast.info('Nada que registrar', 'Ya marcaste a todos los estudiantes de esta clase.');
      return;
    }
    for (const student of pending) mark(student._id, true);
    toast.success(`${pending.length} estudiantes marcados como presentes`);
  }

  return (
    <PageContainer>
      <PageHeader
        title="Asistencia"
        subtitle="Registra la asistencia de una clase; cada marca se guarda al instante"
        actions={
          canWrite && enrolled.data.length > 0 ? (
            <Button variant="secondary" onClick={markAllPresent}>
              <Check aria-hidden />
              Marcar todos presentes
            </Button>
          ) : null
        }
      />

      <div className="flex flex-wrap items-end gap-3">
        <Field label="Periodo" className="w-36">
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
              <option value="">Selecciona una materia</option>
              {periodSubjects.map((subject) => (
                <option key={subject._id} value={subject._id}>
                  {subject.name} ({subject.code})
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>

        <Field label="Fecha de clase" className="w-48">
          {(props) => (
            <Input
              {...props}
              type="date"
              value={date}
              max={toIsoDate()}
              onChange={(event) => setDate(event.target.value)}
            />
          )}
        </Field>
      </div>

      {subjectId && enrolled.data.length > 0 ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <CalendarCheck className="size-4 text-primary" aria-hidden />
              Progreso de esta clase
            </CardTitle>
            <CardDescription>
              {registeredCount} de {enrolled.data.length} registrados · {presentCount} presentes
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Progress
              value={(registeredCount / enrolled.data.length) * 100}
              tone={registeredCount === enrolled.data.length ? 'success' : 'primary'}
              label="Progreso del registro de asistencia"
            />
          </CardContent>
        </Card>
      ) : null}

      {!subjectId ? (
        <Card>
          <EmptyState
            title="Selecciona una materia"
            message="Elige la materia y la fecha de la clase para pasar lista."
          />
        </Card>
      ) : enrolled.isPending || attendance.isPending ? (
        <SkeletonList rows={6} />
      ) : enrolled.isError ? (
        <Card>
          <ErrorState error={enrolled.error} />
        </Card>
      ) : enrolled.data.length === 0 ? (
        <Card>
          <EmptyState
            title="Sin estudiantes en esta materia"
            message="Matricula estudiantes en la materia para poder registrar asistencia."
          />
        </Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {enrolled.data.map((student) => {
            const marked = marksForDate.get(student._id);
            const rate = ratesByStudent.get(student._id);

            return (
              <li
                key={student._id}
                className={cn(
                  'surface-card flex items-center gap-3 p-3 transition-colors',
                  marked === true && 'border-success/40 bg-success-soft/30',
                  marked === false && 'border-danger/40 bg-danger-soft/30',
                )}
              >
                <Avatar name={student.fullName} src={student.photoUrl} size="sm" />

                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium text-text">{student.fullName}</span>
                  <span className="truncate font-mono text-xs text-muted">{student.code}</span>
                </div>

                {rate !== undefined ? (
                  <Badge
                    tone={rate >= 80 ? 'success' : rate >= 70 ? 'warning' : 'danger'}
                    title="Asistencia acumulada en el periodo"
                  >
                    {formatPercent(rate)}
                  </Badge>
                ) : null}

                {canWrite ? (
                  <div className="flex gap-1.5">
                    <Button
                      variant={marked === true ? 'primary' : 'outline'}
                      size="sm"
                      onClick={() => mark(student._id, true)}
                      aria-pressed={marked === true}
                      aria-label={`Marcar presente a ${student.fullName}`}
                    >
                      <Check aria-hidden />
                      Presente
                    </Button>
                    <Button
                      variant={marked === false ? 'danger' : 'outline'}
                      size="sm"
                      onClick={() => mark(student._id, false)}
                      aria-pressed={marked === false}
                      aria-label={`Marcar ausente a ${student.fullName}`}
                    >
                      <X aria-hidden />
                      Ausente
                    </Button>
                  </div>
                ) : (
                  <Badge tone={marked ? 'success' : marked === false ? 'danger' : 'neutral'}>
                    {marked === true ? 'Presente' : marked === false ? 'Ausente' : 'Sin registro'}
                  </Badge>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </PageContainer>
  );
}
