import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  CalendarX,
  CheckCircle2,
  GraduationCap,
  RefreshCw,
  Users,
  XCircle,
} from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Chart,
  EmptyState,
  ErrorState,
  PageContainer,
  PageHeader,
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
              fontSize: 26,
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

  return (
    <PageContainer>
      <PageHeader
        title={`Hola, ${firstName}`}
        subtitle="Este es el estado actual de tus grupos"
        actions={
          <Button
            variant="secondary"
            onClick={() => {
              void dashboard.refetch();
              void risks.refetch();
            }}
            loading={dashboard.isFetching || risks.isFetching}
          >
            <RefreshCw aria-hidden />
            Actualizar
          </Button>
        }
      />

      {dashboard.isPending ? (
        <SkeletonStatGrid />
      ) : dashboard.isError ? (
        <Card>
          <ErrorState error={dashboard.error} onRetry={() => void dashboard.refetch()} />
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
          <StatCard
            index={0}
            label="Promedio actual"
            value={formatGrade(summary?.averageGrade)}
            hint="Sobre cortes calificados"
            tone="primary"
            icon={GraduationCap}
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

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Distribución de desempeño</CardTitle>
            <CardDescription>
              {formatCount(summary?.criticalSubjects)} materias con promedio bajo ·{' '}
              {formatCount(summary?.missedClasses)} inasistencias acumuladas
            </CardDescription>
          </CardHeader>
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
          <CardHeader>
            <CardTitle>Asistencia global</CardTitle>
            <CardDescription>Promedio ponderado por minutos de clase</CardDescription>
          </CardHeader>
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
        <CardHeader className="flex-row items-center justify-between">
          <div className="flex flex-col gap-1">
            <CardTitle>Estudiantes que necesitan atención</CardTitle>
            <CardDescription>Ordenados por nivel de riesgo</CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate('/riesgo')}>
            Ver todos
          </Button>
        </CardHeader>
        <CardContent>
          {risks.isPending ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 4 }, (_, index) => (
                <div key={index} className="skeleton h-12 rounded-lg" />
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
                <li
                  key={`${risk.studentId}-${risk.subjectId}`}
                  className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5"
                >
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium text-text">{risk.fullName}</span>
                    <span className="truncate text-xs text-muted">
                      Cédula {risk.code} · Nota {formatGrade(risk.notaFinal)} · Asistencia{' '}
                      {formatPercent(risk.attendanceRate)}
                    </span>
                  </div>
                  <RiskBadge
                    level={risk.level}
                    {...(risk.motivos[0] ? { reason: risk.motivos[0] } : {})}
                    className="max-w-md"
                  />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
