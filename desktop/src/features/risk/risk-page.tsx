import { useMemo, useState } from 'react';
import { RefreshCw, ScanSearch, UserSearch } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DataTable,
  EmptyState,
  ErrorState,
  Input,
  PageContainer,
  PageHeader,
  Progress,
  RiskBadge,
  SkeletonTable,
  Tabs,
  TabsList,
  TabsTrigger,
  type Column,
} from '@/shared/ui';
import { useRisks } from '@/features/dashboard/hooks/use-dashboard';
import { AttendanceCasesCard } from '@/features/risk/components/attendance-cases-card';
import {
  INTERVENTION_LABELS,
  INTERVENTION_ORDER,
  INTERVENTION_TONE,
} from '@/features/risk/components/intervention-dialog';
import { BuscarEstudianteDialog } from '@/features/risk/components/buscar-estudiante-dialog';
import { SeguimientoDialog } from '@/features/risk/components/seguimiento-dialog';
import { useScanRisks } from '@/features/notifications/hooks/use-notifications';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { formatGrade, formatPercent } from '@/shared/lib/format';
import { useUserRole } from '@/state/session.store';
import { can } from '@/core/auth/permissions';
import type { RiskItem } from '@/domain/schemas/academic';
import type { RiskLevel } from '@/domain/schemas/common';

type Filter = 'all' | RiskLevel;

/**
 * Academic risk.
 *
 * Every row states the reasons behind the classification. A teacher who is
 * about to contact a student needs to know *why* the system flagged them -
 * "high risk" with no explanation is not actionable, and it is not fair either.
 */
export default function RiskPage() {
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query, 200);

  const role = useUserRole();
  const canScan = can(role, 'notifications.scan');

  const risks = useRisks();
  const [seguimiento, setSeguimiento] = useState<RiskItem | null>(null);
  const [buscando, setBuscando] = useState(false);
  const scanRisks = useScanRisks();

  const items = risks.data ?? [];

  const counts = useMemo(
    () => ({
      all: items.length,
      HIGH: items.filter((item) => item.level === 'HIGH').length,
      MEDIUM: items.filter((item) => item.level === 'MEDIUM').length,
      LOW: items.filter((item) => item.level === 'LOW').length,
    }),
    [items],
  );

  const filtered = useMemo(() => {
    const term = debouncedQuery.trim().toLowerCase();

    return items.filter((item) => {
      if (filter !== 'all' && item.level !== filter) return false;
      if (!term) return true;
      return (
        item.fullName.toLowerCase().includes(term) || item.code.toLowerCase().includes(term)
      );
    });
  }, [items, filter, debouncedQuery]);

  const columns = useMemo<Column<RiskItem>[]>(
    () => [
      {
        key: 'student',
        header: 'Estudiante',
        width: '1.6fr',
        sortValue: (row) => row.fullName,
        cell: (row) => (
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-medium">{row.fullName}</span>
            <span className="truncate font-mono text-caption text-muted">{row.code}</span>
          </div>
        ),
      },
      {
        key: 'level',
        header: 'Nivel',
        width: '1.4fr',
        sortValue: (row) => row.riskScore,
        cell: (row) => (
          <RiskBadge level={row.level} {...(row.motivos[0] ? { reason: row.motivos[0] } : {})} />
        ),
      },
      {
        key: 'grade',
        header: 'Nota',
        width: '0.8fr',
        align: 'center',
        sortValue: (row) => row.notaFinal,
        cell: (row) => (
          <span
            className={`font-mono tabular-nums ${row.notaFinal < 3 ? 'text-danger' : 'text-text'}`}
          >
            {formatGrade(row.notaFinal)}
          </span>
        ),
      },
      {
        key: 'attendance',
        header: 'Asistencia',
        width: '1fr',
        align: 'center',
        sortValue: (row) => row.attendanceRate,
        cell: (row) => (
          <div className="flex flex-col items-center gap-1">
            <span className="font-mono text-caption tabular-nums">
              {formatPercent(row.attendanceRate)}
            </span>
            <Progress
              value={row.attendanceRate}
              tone={
                row.attendanceRate >= 80 ? 'success' : row.attendanceRate >= 70 ? 'warning' : 'danger'
              }
              className="w-16"
            />
          </div>
        ),
      },
      {
        key: 'missed',
        header: 'Faltas',
        width: '0.7fr',
        align: 'center',
        sortValue: (row) => row.missed,
        cell: (row) => <span className="font-mono tabular-nums">{row.missed}</span>,
      },
      {
        key: 'score',
        header: 'Puntaje',
        width: '0.8fr',
        align: 'right',
        sortValue: (row) => row.riskScore,
        cell: (row) => (
          <span className="font-mono text-caption tabular-nums text-muted">{row.riskScore}/100</span>
        ),
      },
      {
        key: 'intervention',
        header: 'Seguimiento',
        width: '1.2fr',
        align: 'center',
        // Ordena por «cuánto falta por hacer»: lo pendiente arriba, lo resuelto
        // abajo. Es el orden en que un docente quiere leer esta columna.
        sortValue: (row) => INTERVENTION_ORDER[row.interventionStatus],
        cell: (row) => (
          <Button
            variant="ghost"
            className="h-auto px-2 py-1"
            onClick={() => setSeguimiento(row)}
            title={row.interventionNote || 'Anotar qué se hizo'}
          >
            <Badge tone={INTERVENTION_TONE[row.interventionStatus]}>
              {INTERVENTION_LABELS[row.interventionStatus]}
            </Badge>
          </Button>
        ),
      },
    ],
    [],
  );

  return (
    <PageContainer>
      <PageHeader
        title="Riesgo académico"
        subtitle="Quién necesita intervención, con el motivo detrás de cada alerta"
        actions={
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => void risks.refetch()}
              loading={risks.isFetching}
            >
              <RefreshCw aria-hidden />
              Actualizar
            </Button>
            {canScan ? (
              <Button
                variant="primary"
                onClick={() => scanRisks.mutate(undefined)}
                loading={scanRisks.isPending}
              >
                <ScanSearch aria-hidden />
                Generar alertas
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="grid gap-4 @2xl:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Riesgo alto</CardDescription>
            <CardTitle className="font-mono text-h2 text-danger">{counts.HIGH}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-caption text-muted">Requieren contacto inmediato</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Riesgo medio</CardDescription>
            <CardTitle className="font-mono text-h2 text-warning">{counts.MEDIUM}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-caption text-muted">Seguimiento en las próximas semanas</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total en seguimiento</CardDescription>
            <CardTitle className="font-mono text-h2">{counts.all}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-caption text-muted">Estudiantes con alguna señal de alerta</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={filter} onValueChange={(value) => setFilter(value as Filter)}>
          <TabsList>
            <TabsTrigger value="all">
              Todos <Badge>{counts.all}</Badge>
            </TabsTrigger>
            <TabsTrigger value="HIGH">
              Alto <Badge tone="danger">{counts.HIGH}</Badge>
            </TabsTrigger>
            <TabsTrigger value="MEDIUM">
              Medio <Badge tone="warning">{counts.MEDIUM}</Badge>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filtrar esta lista…"
          aria-label="Filtrar la lista de riesgo"
          className="max-w-xs"
        />

        {/*
          Dos búsquedas distintas y por eso dos controles. El campo de al lado
          filtra ESTA lista; este botón busca en todo el alcance del docente.
          Hace falta porque `/analytics/risks` descarta el nivel BAJO y corta en
          50 casos: quien no salió ahí era inalcanzable, y son justo los casos
          que un docente ve venir antes que el motor.
        */}
        <Button variant="secondary" className="ml-auto" onClick={() => setBuscando(true)}>
          <UserSearch aria-hidden />
          Buscar a otro estudiante
        </Button>
      </div>

      {risks.isPending ? (
        <SkeletonTable rows={8} columns={6} />
      ) : risks.isError ? (
        <Card>
          <ErrorState error={risks.error} onRetry={() => void risks.refetch()} />
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState
            title="Ningún estudiante en riesgo"
            message="Todos tus estudiantes están dentro de los parámetros esperados de nota y asistencia."
          />
        </Card>
      ) : (
        <>
          <DataTable
            rows={filtered}
            columns={columns}
            getRowId={(row) => `${row.studentId}-${row.subjectId}`}
            searchQuery={debouncedQuery}
            onClearSearch={() => setQuery('')}
          />

          {/* The reasons are the actionable part, so they get their own block. */}
          <Card>
            <CardHeader>
              <CardTitle>Motivos detallados</CardTitle>
              <CardDescription>Por qué el sistema marcó a cada estudiante</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {filtered.slice(0, 20).map((item) => (
                <div
                  key={`${item.studentId}-${item.subjectId}-reasons`}
                  className="flex flex-col gap-1.5 rounded-lg border border-border p-3"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-body font-medium text-text">{item.fullName}</span>
                    <RiskBadge level={item.level} />
                  </div>
                  {item.motivos.length > 0 ? (
                    <ul className="ml-4 list-disc text-caption text-muted">
                      {item.motivos.map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-caption text-muted">Sin motivos registrados.</p>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}

      {/*
        Los patrones de inasistencia van aquí y no en pantalla propia: responden
        la misma pregunta que el riesgo —«¿a quién hay que atender?»— desde el
        otro lado. El riesgo mira el acumulado del semestre; esto mira la FORMA
        de las faltas, que es lo que detecta a tiempo.
      */}
      <AttendanceCasesCard />

      {/* La alerta dice quién y por qué; esto es el expediente y el
          acompañamiento: faltas, notas, episodios y su resultado. */}
      <SeguimientoDialog
        row={seguimiento}
        onOpenChange={(open) => !open && setSeguimiento(null)}
      />

      {/* Encadena con el diálogo de arriba: al elegir materia, ese es el que
          se abre. El buscador solo resuelve a quién y sobre qué. */}
      <BuscarEstudianteDialog
        open={buscando}
        onOpenChange={setBuscando}
        onElegir={setSeguimiento}
      />
    </PageContainer>
  );
}
