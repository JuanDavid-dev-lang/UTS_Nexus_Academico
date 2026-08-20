import { useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  CalendarX,
  CheckCircle2,
  GraduationCap,
  RefreshCw,
  Users,
  XCircle,
} from 'lucide-react';
import {
  Avatar,
  Button,
  Card,
  CardContent,
  CardHeaderRow,
  Chart,
  EmptyState,
  ErrorState,
  PageContainer,
  PageHero,
  RiskBadge,
  SkeletonStatGrid,
  StatCard,
  type ChartTokens,
} from '@/shared/ui';
import { useDashboard, useRisks } from '@/features/dashboard/hooks/use-dashboard';
import { formatCount, formatGrade, formatPercent } from '@/shared/lib/format';
import { useCurrentUser } from '@/state/session.store';

/**
 * Teacher dashboard.
 *
 * Answers three questions in order of urgency: how is the group doing, who
 * needs help right now, and what is the attendance situation. Everything else
 * belongs on its own page.
 */

const saludoFormatter = new Intl.DateTimeFormat('es-CO', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

/**
 * El panel abre diciendo qué hora del día es para quien lo mira.
 *
 * No es cortesía: es la pieza que confirma que la aplicación está viva y
 * mirando lo mismo que el docente. Un panel que dice «Hola, Juan» a las once de
 * la noche igual que a las siete de la mañana es un panel que no sabe nada.
 */
function saludoSegunHora(hora: number): string {
  if (hora < 12) return 'Buenos días';
  if (hora < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const user = useCurrentUser();
  const dashboard = useDashboard();
  const risks = useRisks();

  const summary = dashboard.data;

  // Memoised so the chart is not rebuilt on every unrelated re-render.
  const buildPerformanceChart = useCallback(
    (tokens: ChartTokens) => ({
      grid: { top: 16, right: 16, bottom: 28, left: 40 },
      xAxis: {
        type: 'category',
        data: ['Aprobados', 'Reprobados', 'En riesgo'],
        axisLine: { lineStyle: { color: tokens.border } },
        axisTick: { show: false },
        axisLabel: { color: tokens.muted },
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: tokens.border, type: 'dashed' } },
        axisLabel: { color: tokens.muted },
      },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      series: [
        {
          type: 'bar',
          barWidth: '46%',
          itemStyle: { borderRadius: [8, 8, 0, 0] },
          data: [
            { value: summary?.approvedStudents ?? 0, itemStyle: { color: tokens.success } },
            { value: summary?.failedStudents ?? 0, itemStyle: { color: tokens.danger } },
            { value: summary?.riskStudents ?? 0, itemStyle: { color: tokens.warning } },
          ],
        },
      ],
    }),
    [summary],
  );

  const buildAttendanceChart = useCallback(
    (tokens: ChartTokens) => {
      const rate = summary?.averageAttendance ?? 0;
      return {
        series: [
          {
            type: 'pie',
            radius: ['62%', '84%'],
            avoidLabelOverlap: false,
            label: {
              show: true,
              position: 'center',
              formatter: `${rate.toFixed(0)}%`,
              fontSize: 30,
              fontWeight: 700,
              color: tokens.text,
            },
            labelLine: { show: false },
            data: [
              { value: rate, name: 'Asistencia', itemStyle: { color: tokens.info } },
              {
                value: Math.max(0, 100 - rate),
                name: 'Inasistencia',
                itemStyle: { color: tokens.border },
              },
            ],
          },
        ],
        tooltip: { trigger: 'item', formatter: '{b}: {c}%' },
      };
    },
    [summary],
  );

  const firstName = user?.fullName?.split(' ')[0] ?? 'Docente';
  const topRisks = risks.data?.slice(0, 6) ?? [];

  const hoy = useMemo(() => {
    const ahora = new Date();
    return { saludo: saludoSegunHora(ahora.getHours()), fecha: saludoFormatter.format(ahora) };
  }, []);

  const enRiesgo = summary?.riskStudents ?? 0;
  const cargando = dashboard.isFetching || risks.isFetching;

  return (
    <PageContainer>
      <PageHero
        eyebrow={hoy.fecha}
        title={`${hoy.saludo}, ${firstName}`}
        subtitle="Este es el estado actual de tus grupos."
        actions={
          <Button
            variant="secondary"
            className="border-white/25 bg-white/10 text-white hover:bg-white/20 dark:border-border dark:bg-surface-alt dark:text-text"
            onClick={() => {
              void dashboard.refetch();
              void risks.refetch();
            }}
            loading={cargando}
          >
            <RefreshCw aria-hidden />
            Actualizar
          </Button>
        }
      >
        {/*
          Lo primero que ve el docente no es un número: es si hay algo que
          hacer. Un panel que solo informa obliga a interpretar seis cifras
          para llegar a la única conclusión que importa, y esa conclusión —hay
          gente que necesita intervención— cabe en una línea con un botón.
        */}
        {dashboard.isPending ? null : enRiesgo > 0 ? (
          <button
            type="button"
            onClick={() => navigate('/riesgo')}
            className="group flex w-full items-center gap-3 rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-left transition-colors hover:bg-white/20 dark:border-warning/30 dark:bg-warning-soft/60 dark:hover:bg-warning-soft"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-warning/20 text-warning dark:bg-warning/20">
              <AlertTriangle className="size-4" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-body font-semibold">
                {formatCount(enRiesgo)}{' '}
                {enRiesgo === 1 ? 'estudiante necesita' : 'estudiantes necesitan'} seguimiento
              </span>
              <span className="block text-caption text-white/70 dark:text-muted">
                Revisa el detalle y decide la intervención
              </span>
            </span>
            <ArrowRight
              className="size-4 shrink-0 transition-transform group-hover:translate-x-0.5"
              aria-hidden
            />
          </button>
        ) : (
          <div className="flex items-center gap-3 rounded-xl border border-white/20 bg-white/10 px-4 py-3 dark:border-success/30 dark:bg-success-soft/60">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-success/25 text-success">
              <CheckCircle2 className="size-4" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block text-body font-semibold">Sin estudiantes en riesgo</span>
              <span className="block text-caption text-white/70 dark:text-muted">
                Todo tu alumnado está dentro de los parámetros esperados
              </span>
            </span>
          </div>
        )}
      </PageHero>

      {dashboard.isPending ? (
        <SkeletonStatGrid />
      ) : dashboard.isError ? (
        <Card>
          <ErrorState error={dashboard.error} onRetry={() => void dashboard.refetch()} />
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-4 @3xl:grid-cols-3 @6xl:grid-cols-6">
          <StatCard
            index={0}
            label="Promedio actual"
            value={formatGrade(summary?.averageGrade)}
            hint="Sobre cortes calificados"
            tone="primary"
            icon={GraduationCap}
            // La escala es 0–5, así que el promedio como porcentaje de 5 es la
            // proporción real; sin ella un 3.2 y un 4.7 se ven igual de largos.
            {...(typeof summary?.averageGrade === 'number'
              ? { progress: (summary.averageGrade / 5) * 100 }
              : {})}
          />
          <StatCard
            index={1}
            label="Aprobados"
            value={formatCount(summary?.approvedStudents)}
            hint="Proyección al día de hoy"
            tone="success"
            icon={CheckCircle2}
          />
          <StatCard
            index={2}
            label="Reprobados"
            value={formatCount(summary?.failedStudents)}
            hint="Al menos una materia perdida"
            tone="danger"
            icon={XCircle}
          />
          <StatCard
            index={3}
            label="En riesgo"
            value={formatCount(summary?.riskStudents)}
            hint="Requieren seguimiento"
            tone="warning"
            icon={AlertTriangle}
            onClick={() => navigate('/riesgo')}
          />
          <StatCard
            index={4}
            label="Asistencia"
            value={formatPercent(summary?.averageAttendance)}
            hint="Ponderada por minutos"
            tone="info"
            icon={CalendarX}
            {...(typeof summary?.averageAttendance === 'number'
              ? { progress: summary.averageAttendance }
              : {})}
          />
          <StatCard
            index={5}
            label="Estudiantes"
            value={formatCount(summary?.totalStudents)}
            hint={`${formatCount(summary?.totalSubjects)} materias a tu cargo`}
            tone="neutral"
            icon={Users}
            onClick={() => navigate('/estudiantes')}
          />
        </div>
      )}

      <div className="grid gap-4 @5xl:grid-cols-3">
        <Card className="@5xl:col-span-2">
          <CardHeaderRow
            title="Distribución de desempeño"
            description={`${formatCount(summary?.criticalSubjects)} materias con promedio bajo · ${formatCount(summary?.missedClasses)} inasistencias acumuladas`}
          />
          <CardContent>
            {dashboard.isPending ? (
              <div className="skeleton h-[280px] rounded-lg" />
            ) : (
              <Chart
                buildOption={buildPerformanceChart}
                ariaLabel="Gráfico de barras con estudiantes aprobados, reprobados y en riesgo"
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeaderRow
            title="Asistencia global"
            description="Promedio ponderado por minutos de clase"
          />
          <CardContent>
            {dashboard.isPending ? (
              <div className="skeleton h-[280px] rounded-lg" />
            ) : (
              <Chart
                buildOption={buildAttendanceChart}
                ariaLabel={`Anillo de asistencia: ${formatPercent(summary?.averageAttendance)}`}
              />
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeaderRow
          title="Estudiantes que necesitan atención"
          description="Ordenados por nivel de riesgo"
          actions={
            <Button variant="ghost" size="sm" onClick={() => navigate('/riesgo')}>
              Ver todos
              <ArrowRight aria-hidden />
            </Button>
          }
        />
        <CardContent>
          {risks.isPending ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 4 }, (_, index) => (
                <div key={index} className="skeleton h-14 rounded-lg" />
              ))}
            </div>
          ) : risks.isError ? (
            <ErrorState error={risks.error} onRetry={() => void risks.refetch()} />
          ) : topRisks.length === 0 ? (
            <EmptyState
              title="Ningún estudiante en riesgo"
              message="Todos tus estudiantes están dentro de los parámetros esperados."
            />
          ) : (
            <ul className="flex flex-col gap-2">
              {topRisks.map((risk) => (
                <li key={`${risk.studentId}-${risk.subjectId}`}>
                  {/*
                    La fila entera lleva a riesgo, no solo un enlace al final.
                    Es un botón y no un `div` con `onClick` para que el teclado
                    llegue a ella y el lector de pantalla la anuncie como lo que
                    es: la forma de abrir el expediente de ese estudiante.
                  */}
                  <button
                    type="button"
                    onClick={() => navigate('/riesgo')}
                    className="flex w-full items-center gap-3 rounded-lg border border-border px-3 py-2.5 text-left transition-colors duration-200 hover:border-border-strong hover:bg-surface-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  >
                    <Avatar name={risk.fullName} size="sm" />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-body font-medium text-text">
                        {risk.fullName}
                      </span>
                      <span className="truncate text-caption tabular text-muted">
                        Cédula {risk.code} · Nota {formatGrade(risk.notaFinal)} · Asistencia{' '}
                        {formatPercent(risk.attendanceRate)}
                      </span>
                    </div>
                    <RiskBadge
                      level={risk.level}
                      {...(risk.motivos[0] ? { reason: risk.motivos[0] } : {})}
                      className="max-w-md"
                    />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
