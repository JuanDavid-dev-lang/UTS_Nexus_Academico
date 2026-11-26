import { useCallback, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Chart,
  DataTable,
  EmptyState,
  ErrorState,
  Field,
  Input,
  NativeSelect,
  PageContainer,
  PageHeader,
  SkeletonStatGrid,
  SkeletonTable,
  StatCard,
  type ChartTokens,
  type Column,
} from '@/shared/ui';
import { useListadoPaginado } from '@/shared/hooks/use-listado-paginado';
import { queryKeys } from '@/core/api/query-keys';
import { usageRepository, type FiltroUso } from '@/infrastructure/repositories/usage.repository';
import { institutionsRepository } from '@/infrastructure/repositories/institutions.repository';
import { platform } from '@/core/platform/tauri';
import { toast } from '@/state/toast.store';
import type { FilaRankingUso } from '@/domain/schemas/usage';

/**
 * Uso de la aplicación (solo ADMIN).
 *
 * Estadística interna: cuántas personas usan la aplicación, desde qué cliente
 * y quién la usa más. No se publica, y las personas fueron avisadas al entrar
 * (`docs/USO_Y_PRIVACIDAD.md`). Todos los números los calcula el servidor; esta
 * pantalla solo los pinta.
 */

const ROLES: { valor: string; etiqueta: string }[] = [
  { valor: 'ADMIN', etiqueta: 'Administración' },
  { valor: 'COORDINATOR', etiqueta: 'Coordinación' },
  { valor: 'SECRETARY', etiqueta: 'Secretaría' },
  { valor: 'PROFESSOR', etiqueta: 'Docente' },
];
const ETIQUETA_ROL = Object.fromEntries(ROLES.map((r) => [r.valor, r.etiqueta]));
const ETIQUETA_CLIENTE: Record<string, string> = { escritorio: 'Escritorio', web: 'Web', movil: 'Móvil' };

const formatoHora = new Intl.DateTimeFormat('es-CO', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

function horas(minutos: number): string {
  if (minutos < 60) return `${minutos} min`;
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export default function UsagePage() {
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [institutionId, setInstitutionId] = useState('');
  const [rol, setRol] = useState('');

  const filtro = useMemo<FiltroUso>(
    () => ({ desde, hasta, institutionId, rol }),
    [desde, hasta, institutionId, rol],
  );

  const resumen = useQuery({
    queryKey: queryKeys.usage.resumen(filtro),
    queryFn: () => usageRepository.resumen(filtro),
  });

  const ranking = useListadoPaginado({
    queryKey: queryKeys.usage.ranking(filtro),
    consultar: (pagina) => usageRepository.ranking({ ...filtro, ...pagina }),
  });

  const instituciones = useQuery({
    queryKey: queryKeys.institutions.activas(),
    queryFn: () => institutionsRepository.activas(),
    staleTime: 5 * 60_000,
  });

  const exportar = useMutation({
    mutationFn: async () => {
      const blob = await usageRepository.exportar(filtro);
      const r = resumen.data;
      const nombre = `UTS-uso-${r?.desde ?? 'inicio'}-a-${r?.hasta ?? 'hoy'}.xlsx`;
      return { path: await platform.files.saveDownload(nombre, blob), nombre };
    },
    onSuccess({ path, nombre }) {
      toast.withAction('success', 'Exportación lista', nombre, {
        label: 'Abrir carpeta',
        onClick: () => void platform.files.reveal(path),
      });
    },
    onError: (causa) => toast.fromError(causa, 'No se pudo exportar'),
  });

  const serie = resumen.data?.activosPorDia;
  const construirGrafico = useCallback(
    (tokens: ChartTokens) => ({
      grid: { top: 16, right: 16, bottom: 28, left: 36 },
      xAxis: {
        type: 'category',
        data: (serie ?? []).map((d) => d.dia.slice(5)),
        axisLine: { lineStyle: { color: tokens.border } },
        axisTick: { show: false },
        axisLabel: { color: tokens.muted },
      },
      yAxis: {
        type: 'value',
        minInterval: 1,
        splitLine: { lineStyle: { color: tokens.border, type: 'dashed' } },
        axisLabel: { color: tokens.muted },
      },
      tooltip: { trigger: 'axis' },
      series: [
        {
          name: 'Personas activas',
          type: 'bar',
          barMaxWidth: 18,
          itemStyle: { color: tokens.primary, borderRadius: [3, 3, 0, 0] },
          data: (serie ?? []).map((d) => d.usuarios),
        },
      ],
    }),
    [serie],
  );

  const columnas: Column<FilaRankingUso>[] = [
    {
      key: 'posicion',
      header: '#',
      width: '56px',
      cell: (f) => <span className="tabular-nums text-muted">{f.posicion}</span>,
    },
    {
      key: 'nombre',
      header: 'Persona',
      cell: (f) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate">{f.nombre}</span>
          <span className="truncate text-caption text-muted">{f.correo}</span>
        </div>
      ),
    },
    {
      key: 'rol',
      header: 'Rol',
      width: '150px',
      cell: (f) => <Badge tone="neutral">{ETIQUETA_ROL[f.rol] ?? f.rol}</Badge>,
    },
    {
      key: 'institucion',
      header: 'Institución',
      width: '120px',
      cell: (f) => f.institucion ?? <span className="text-muted">—</span>,
    },
    {
      key: 'diasActivos',
      header: 'Días',
      width: '80px',
      cell: (f) => <span className="tabular-nums">{f.diasActivos}</span>,
    },
    {
      key: 'minutos',
      header: 'Tiempo activo',
      width: '130px',
      cell: (f) => <span className="tabular-nums">{horas(f.minutos)}</span>,
    },
    {
      key: 'ultimaActividad',
      header: 'Última actividad',
      width: '170px',
      cell: (f) => <span className="tabular-nums">{formatoHora.format(new Date(f.ultimaActividad))}</span>,
    },
  ];

  const datos = resumen.data;

  return (
    <PageContainer>
      <PageHeader
        title="Uso de la aplicación"
        subtitle="Estadística interna: quién usa la aplicación y cuánto. No se publica; solo la ve la administración."
        actions={
          <Button
            variant="secondary"
            onClick={() => exportar.mutate()}
            disabled={exportar.isPending || !datos}
          >
            <Download className="size-4" aria-hidden />
            Exportar
          </Button>
        }
      />

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <Field label="Desde" className="min-w-[160px]">
            {(props) => (
              <Input {...props} type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
            )}
          </Field>
          <Field label="Hasta" className="min-w-[160px]">
            {(props) => (
              <Input {...props} type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
            )}
          </Field>
          {(instituciones.data?.length ?? 0) > 1 ? (
            <Field label="Institución" className="min-w-[180px]">
              {(props) => (
                <NativeSelect {...props} value={institutionId} onChange={(e) => setInstitutionId(e.target.value)}>
                  <option value="">Todas</option>
                  {(instituciones.data ?? []).map((i) => (
                    <option key={i.id} value={i.institutionId}>
                      {i.sigla}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>
          ) : null}
          <Field label="Rol" className="min-w-[170px]">
            {(props) => (
              <NativeSelect {...props} value={rol} onChange={(e) => setRol(e.target.value)}>
                <option value="">Todos</option>
                {ROLES.map((r) => (
                  <option key={r.valor} value={r.valor}>
                    {r.etiqueta}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
          <Button
            variant="ghost"
            onClick={() => {
              setDesde('');
              setHasta('');
              setInstitutionId('');
              setRol('');
            }}
          >
            Limpiar
          </Button>
          {datos ? (
            <span className="ml-auto text-caption text-muted tabular-nums">
              {datos.desde} — {datos.hasta}
            </span>
          ) : null}
        </CardContent>
      </Card>

      {resumen.isPending ? <SkeletonStatGrid count={4} /> : null}
      {resumen.isError ? <ErrorState error={resumen.error} onRetry={() => void resumen.refetch()} /> : null}

      {datos ? (
        <>
          <div className="grid grid-cols-2 gap-4 @3xl:grid-cols-4">
            <StatCard label="Activos hoy" value={datos.recientes.hoy} />
            <StatCard label="Últimos 7 días" value={datos.recientes.semana} />
            <StatCard label="Últimos 30 días" value={datos.recientes.mes} />
            <StatCard
              label="Tiempo activo en el rango"
              value={horas(datos.totales.minutos)}
              hint={`${datos.totales.usuarios} personas`}
            />
          </div>

          <div className="grid gap-4 @5xl:grid-cols-3">
            <Card className="@5xl:col-span-2">
              <CardHeader>
                <CardTitle>Personas activas por día</CardTitle>
              </CardHeader>
              <CardContent>
                <Chart buildOption={construirGrafico} height={240} ariaLabel="Personas activas por día" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Por cliente y por rol</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <dl className="flex flex-col gap-2 text-body">
                  {datos.porCliente.map((c) => (
                    <div key={c.cliente} className="flex items-baseline justify-between gap-3">
                      <dt className="text-muted">{ETIQUETA_CLIENTE[c.cliente] ?? c.cliente}</dt>
                      <dd className="tabular-nums">{c.usuarios} personas</dd>
                    </div>
                  ))}
                </dl>
                <dl className="flex flex-col gap-2 border-t border-border pt-4 text-body">
                  {datos.porRol.length === 0 ? <span className="text-muted">Sin actividad en el rango.</span> : null}
                  {datos.porRol.map((r) => (
                    <div key={r.rol} className="flex items-baseline justify-between gap-3">
                      <dt className="text-muted">{ETIQUETA_ROL[r.rol] ?? r.rol}</dt>
                      <dd className="tabular-nums">
                        {r.usuarios} · {horas(r.minutos)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}

      {ranking.isPending ? <SkeletonTable rows={8} columns={6} /> : null}
      {ranking.isError ? <ErrorState error={ranking.error} onRetry={() => void ranking.refetch()} /> : null}
      {ranking.isSuccess ? (
        ranking.items.length === 0 ? (
          <EmptyState title="Sin actividad" message="Nadie usó la aplicación con estos filtros." />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Quién la usa más</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <DataTable
                rows={ranking.items}
                columns={columnas}
                getRowId={(f) => f.userId}
                emptyTitle="Sin actividad"
                {...ranking.propsDeTabla}
              />
            </CardContent>
          </Card>
        )
      ) : null}
    </PageContainer>
  );
}
