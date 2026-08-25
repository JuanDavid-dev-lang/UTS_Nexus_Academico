import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  BookOpen,
  Download,
  GraduationCap,
  LayoutGrid,
  Users,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  DataTable,
  ErrorState,
  Field,
  Input,
  NativeSelect,
  PageContainer,
  PageHeader,
  SkeletonStatGrid,
  SkeletonTable,
  StatCard,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Tooltip,
  type Column,
} from '@/shared/ui';
import { coordinationRepository } from '@/infrastructure/repositories/coordination.repository';
import { queryKeys } from '@/core/api/query-keys';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { platform } from '@/core/platform/tauri';
import { toast } from '@/state/toast.store';
import { can } from '@/core/auth/permissions';
import { useUserRole } from '@/state/session.store';
import type {
  DocenteCoordinacion,
  GrupoCoordinacion,
  MateriaCoordinacion,
} from '@/domain/schemas/coordination';

/**
 * Coordinación: las carreras a cargo, de punta a punta.
 *
 * Tres cortes de un mismo conjunto —materias con su docente, docentes con sus
 * materias, grupos— y una sola barra de filtros para los tres. Separarlos en
 * tres pantallas con tres filtros habría multiplicado por tres el gesto de
 * «ahora mírame esto mismo pero del otro lado», que es exactamente lo que se
 * hace en una reunión de coordinación.
 *
 * Secretaría entra a esta misma pantalla y ve lo mismo. Lo único que no ve es
 * lo que no existe aquí: no hay ni un botón que escriba. La exportación sí,
 * porque exportar es leer.
 */

const HOY = new Date();
/** Semestre por defecto: el que está corriendo. Enero–junio es el 1. */
const PERIODO_ACTUAL = `${HOY.getFullYear()}-${HOY.getMonth() < 6 ? 1 : 2}`;

/** Nota media. `null` no es un cero: es «todavía no hay nada calificado». */
function nota(valor: number | null): string {
  return valor == null ? '—' : valor.toFixed(2);
}

function porcentaje(valor: number | null): string {
  return valor == null ? '—' : `${Math.round(valor)}%`;
}

/** Chip de riesgo. Sin nadie en riesgo no se pinta un cero en rojo. */
function ChipRiesgo({ cantidad }: { cantidad: number }) {
  if (cantidad === 0) return <span className="text-caption text-muted">—</span>;
  return <Badge tone={cantidad > 4 ? 'danger' : 'warning'}>{cantidad}</Badge>;
}

export default function CoordinationPage() {
  const role = useUserRole();
  const soloLectura = role === 'SECRETARY';

  const [period, setPeriod] = useState(PERIODO_ACTUAL);
  const [programa, setPrograma] = useState('');
  const [q, setQ] = useState('');
  const busqueda = useDebounce(q, 300);

  const filtro = useMemo(
    () => ({
      period: period || undefined,
      programa: programa || undefined,
      q: busqueda.trim() || undefined,
    }),
    [period, programa, busqueda],
  );

  const programas = useQuery({
    queryKey: queryKeys.coordination.programas(),
    queryFn: () => coordinationRepository.programas(),
    staleTime: 5 * 60_000,
  });

  const resumen = useQuery({
    queryKey: queryKeys.coordination.resumen(filtro),
    queryFn: () => coordinationRepository.resumen(filtro),
  });

  const materias = useQuery({
    queryKey: queryKeys.coordination.materias(filtro),
    queryFn: () => coordinationRepository.materias(filtro),
  });

  const docentes = useQuery({
    queryKey: queryKeys.coordination.docentes(filtro),
    queryFn: () => coordinationRepository.docentes(filtro),
  });

  const grupos = useQuery({
    queryKey: queryKeys.coordination.grupos(filtro),
    queryFn: () => coordinationRepository.grupos(filtro),
  });

  const exportar = useMutation({
    mutationFn: async () => {
      const blob = await coordinationRepository.exportar(filtro);
      const sufijo = programa ? `-${programa}` : '';
      const nombre = `UTS-coordinacion-${period || 'todos'}${sufijo}.xlsx`;
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

  const periodos = useMemo(() => {
    // Cuatro semestres hacia atrás desde el actual: más allá de eso ya no se
    // consulta desde coordinación, se consulta la fotografía del periodo.
    const anio = HOY.getFullYear();
    return [
      `${anio + 1}-1`,
      `${anio}-2`,
      `${anio}-1`,
      `${anio - 1}-2`,
      `${anio - 1}-1`,
    ];
  }, []);

  const totales = resumen.data?.totales;
  const alcanceTotal = programas.data?.alcanceTotal ?? false;

  // ── Columnas ──────────────────────────────────────────────────────────────
  const columnasMateria: Column<MateriaCoordinacion>[] = [
    {
      key: 'materia',
      header: 'Materia',
      width: 'minmax(220px, 2fr)',
      sortValue: (row) => row.name,
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate text-body font-medium text-text">{row.name}</p>
          <p className="truncate text-caption text-muted">
            {row.code} · {row.period}
          </p>
        </div>
      ),
    },
    {
      key: 'programa',
      header: 'Programa',
      width: 'minmax(170px, 1.4fr)',
      sortValue: (row) => row.programaNombre,
      cell: (row) => (
        <div className="flex min-w-0 items-center gap-1">
          <span className="truncate text-body text-text">{row.programaNombre}</span>
          {row.programaDeducido && (
            // El dato aproximado se marca. Sin la marca se lee como declarado,
            // y un programa deducido de la adscripción del docente puede estar
            // mal: es una pista, no un hecho.
            <Tooltip content="Deducido de la adscripción del docente: la materia no tiene programa asignado">
              <span className="text-caption text-warning">*</span>
            </Tooltip>
          )}
        </div>
      ),
    },
    {
      key: 'docente',
      header: 'Docente',
      width: 'minmax(180px, 1.4fr)',
      sortValue: (row) => row.docente?.nombre ?? '',
      cell: (row) =>
        row.docente ? (
          <div className="min-w-0">
            <p className="truncate text-body text-text">{row.docente.nombre}</p>
            <p className="truncate text-caption text-muted">{row.docente.email}</p>
          </div>
        ) : (
          <Badge tone="warning">Sin asignar</Badge>
        ),
    },
    {
      key: 'grupos',
      header: 'Grupos',
      align: 'right',
      width: '90px',
      sortValue: (row) => row.grupos,
      cell: (row) => <span className="tabular-nums text-body text-text">{row.grupos}</span>,
    },
    {
      key: 'estudiantes',
      header: 'Estudiantes',
      align: 'right',
      width: '110px',
      sortValue: (row) => row.estudiantes,
      cell: (row) => <span className="tabular-nums text-body text-text">{row.estudiantes}</span>,
    },
    {
      key: 'promedio',
      header: 'Promedio',
      align: 'right',
      width: '100px',
      sortValue: (row) => row.promedio ?? -1,
      cell: (row) => (
        <span
          className={
            row.promedio != null && row.promedio < 3
              ? 'tabular-nums text-body font-semibold text-danger'
              : 'tabular-nums text-body text-text'
          }
        >
          {nota(row.promedio)}
        </span>
      ),
    },
    {
      key: 'asistencia',
      header: 'Asistencia',
      align: 'right',
      width: '105px',
      sortValue: (row) => row.asistencia ?? -1,
      cell: (row) => (
        <span className="tabular-nums text-body text-muted">{porcentaje(row.asistencia)}</span>
      ),
    },
    {
      key: 'riesgo',
      header: 'En riesgo',
      align: 'right',
      width: '100px',
      sortValue: (row) => row.enRiesgo,
      cell: (row) => <ChipRiesgo cantidad={row.enRiesgo} />,
    },
  ];

  const columnasDocente: Column<DocenteCoordinacion>[] = [
    {
      key: 'docente',
      header: 'Docente',
      width: 'minmax(200px, 1.6fr)',
      sortValue: (row) => row.nombre,
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate text-body font-medium text-text">{row.nombre}</p>
          <p className="truncate text-caption text-muted">
            {[row.cedula, row.email].filter(Boolean).join(' · ')}
          </p>
        </div>
      ),
    },
    {
      key: 'materias',
      header: 'Materias que dicta',
      width: 'minmax(240px, 2fr)',
      sortValue: (row) => row.materias.length,
      cell: (row) => (
        <div className="flex min-w-0 flex-wrap gap-1">
          {row.materias.slice(0, 3).map((materia) => (
            <Badge key={materia.id} tone="neutral">
              {materia.code}
            </Badge>
          ))}
          {row.materias.length > 3 && (
            <Tooltip content={row.materias.map((materia) => materia.name).join(' · ')}>
              <Badge tone="neutral">+{row.materias.length - 3}</Badge>
            </Tooltip>
          )}
        </div>
      ),
    },
    {
      key: 'programas',
      header: 'Adscripción',
      width: 'minmax(160px, 1.2fr)',
      cell: (row) =>
        row.programasNombres.length > 0 ? (
          <span className="truncate text-caption text-muted">
            {row.programasNombres.join(' · ')}
          </span>
        ) : (
          <span className="text-caption text-muted">—</span>
        ),
    },
    {
      key: 'grupos',
      header: 'Grupos',
      align: 'right',
      width: '90px',
      sortValue: (row) => row.grupos,
      cell: (row) => <span className="tabular-nums text-body text-text">{row.grupos}</span>,
    },
    {
      key: 'estudiantes',
      header: 'Estudiantes',
      align: 'right',
      width: '110px',
      sortValue: (row) => row.estudiantes,
      cell: (row) => <span className="tabular-nums text-body text-text">{row.estudiantes}</span>,
    },
    {
      key: 'promedio',
      header: 'Promedio',
      align: 'right',
      width: '100px',
      sortValue: (row) => row.promedio ?? -1,
      cell: (row) => <span className="tabular-nums text-body text-text">{nota(row.promedio)}</span>,
    },
    {
      key: 'riesgo',
      header: 'En riesgo',
      align: 'right',
      width: '100px',
      sortValue: (row) => row.enRiesgo,
      cell: (row) => <ChipRiesgo cantidad={row.enRiesgo} />,
    },
  ];

  const columnasGrupo: Column<GrupoCoordinacion>[] = [
    {
      key: 'grupo',
      header: 'Grupo',
      width: 'minmax(120px, 1fr)',
      sortValue: (row) => row.name,
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate text-body font-medium text-text">{row.name}</p>
          <p className="truncate text-caption text-muted">{row.period}</p>
        </div>
      ),
    },
    {
      key: 'materia',
      header: 'Materia',
      width: 'minmax(220px, 2fr)',
      sortValue: (row) => row.materia?.name ?? '',
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate text-body text-text">{row.materia?.name ?? '—'}</p>
          <p className="truncate text-caption text-muted">{row.programaNombre}</p>
        </div>
      ),
    },
    {
      key: 'docente',
      header: 'Docente',
      width: 'minmax(180px, 1.4fr)',
      sortValue: (row) => row.docente?.nombre ?? '',
      cell: (row) =>
        row.docente ? (
          <span className="truncate text-body text-text">{row.docente.nombre}</span>
        ) : (
          <Badge tone="warning">Sin asignar</Badge>
        ),
    },
    {
      key: 'estudiantes',
      header: 'Estudiantes',
      align: 'right',
      width: '110px',
      sortValue: (row) => row.estudiantes,
      cell: (row) => <span className="tabular-nums text-body text-text">{row.estudiantes}</span>,
    },
    {
      key: 'promedio',
      header: 'Promedio',
      align: 'right',
      width: '100px',
      sortValue: (row) => row.promedio ?? -1,
      cell: (row) => <span className="tabular-nums text-body text-text">{nota(row.promedio)}</span>,
    },
    {
      key: 'riesgo',
      header: 'En riesgo',
      align: 'right',
      width: '100px',
      sortValue: (row) => row.enRiesgo,
      cell: (row) => <ChipRiesgo cantidad={row.enRiesgo} />,
    },
  ];

  return (
    <PageContainer>
      <PageHeader
        eyebrow={
          <>
            {soloLectura ? 'Secretaría · consulta' : 'Coordinación'}
            {!alcanceTotal && programas.data && (
              <span className="normal-case text-muted">
                · {programas.data.items.length} programa
                {programas.data.items.length === 1 ? '' : 's'} a cargo
              </span>
            )}
          </>
        }
        title="Panorama académico"
        subtitle={
          soloLectura
            ? 'Consulta y exporta las materias, los docentes y los grupos de tus programas'
            : 'Todas las materias, docentes y grupos de las carreras a tu cargo'
        }
        actions={
          can(role, 'coordination.export') && (
            <Button
              onClick={() => exportar.mutate()}
              disabled={exportar.isPending}
              variant="secondary"
            >
              <Download className="size-4" aria-hidden />
              {exportar.isPending ? 'Preparando…' : 'Exportar a Excel'}
            </Button>
          )
        }
      />

      {/* Filtros: uno solo para los tres cortes. */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <Field label="Periodo" className="w-40">
            {(props) => (
              <NativeSelect
                {...props}
                value={period}
                onChange={(event) => setPeriod(event.target.value)}
              >
                {periodos.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
                <option value="">Todos</option>
              </NativeSelect>
            )}
          </Field>

          <Field label="Programa" className="min-w-64 max-w-md flex-1">
            {(props) => (
              <NativeSelect
                {...props}
                value={programa}
                onChange={(event) => setPrograma(event.target.value)}
              >
                <option value="">
                  {alcanceTotal ? 'Todos los programas' : 'Todos mis programas'}
                </option>
                {(programas.data?.items ?? []).map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.nombre}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>

          <Field label="Buscar" className="min-w-56 flex-1 max-w-sm">
            {(props) => (
              <Input
                {...props}
                value={q}
                onChange={(event) => setQ(event.target.value)}
                placeholder="Materia, código o docente"
              />
            )}
          </Field>
        </CardContent>
      </Card>

      {/* Cifras de cabecera. */}
      {resumen.isPending ? (
        <SkeletonStatGrid />
      ) : resumen.isError ? (
        <ErrorState error={resumen.error} onRetry={() => void resumen.refetch()} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Materias"
            value={totales?.materias ?? 0}
            hint={`${totales?.grupos ?? 0} grupos`}
            icon={BookOpen}
            tone="primary"
            index={0}
          />
          <StatCard
            label="Docentes"
            value={totales?.docentes ?? 0}
            hint="dictando en tus programas"
            icon={GraduationCap}
            tone="info"
            index={1}
          />
          <StatCard
            label="Estudiantes"
            value={totales?.estudiantes ?? 0}
            hint={`promedio ${nota(totales?.promedio ?? null)}`}
            icon={Users}
            tone="accent"
            index={2}
          />
          <StatCard
            label="En riesgo"
            value={totales?.enRiesgo ?? 0}
            hint={`${totales?.reprobando ?? 0} reprobando`}
            icon={AlertTriangle}
            tone={(totales?.enRiesgo ?? 0) > 0 ? 'warning' : 'success'}
            index={3}
          />
        </div>
      )}

      {/* Desglose por carrera: solo cuando hay más de una a la vista. */}
      {(resumen.data?.programas.length ?? 0) > 1 && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {resumen.data!.programas.map((item) => (
            <Card key={item.id || item.nombre}>
              <CardContent className="flex flex-col gap-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 flex-1 truncate text-body font-semibold text-text">
                    {item.nombre}
                  </p>
                  <Badge tone={item.enRiesgo > 0 ? 'warning' : 'success'}>
                    {item.enRiesgo} en riesgo
                  </Badge>
                </div>
                <dl className="grid grid-cols-4 gap-2 text-caption text-muted">
                  <div>
                    <dt>Materias</dt>
                    <dd className="text-body tabular-nums text-text">{item.materias}</dd>
                  </div>
                  <div>
                    <dt>Grupos</dt>
                    <dd className="text-body tabular-nums text-text">{item.grupos}</dd>
                  </div>
                  <div>
                    <dt>Docentes</dt>
                    <dd className="text-body tabular-nums text-text">{item.docentes}</dd>
                  </div>
                  <div>
                    <dt>Promedio</dt>
                    <dd className="text-body tabular-nums text-text">{nota(item.promedio)}</dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Los tres cortes del mismo conjunto. */}
      <Tabs defaultValue="materias">
        <TabsList>
          <TabsTrigger value="materias">
            <BookOpen className="size-4" aria-hidden />
            Materias
          </TabsTrigger>
          <TabsTrigger value="docentes">
            <GraduationCap className="size-4" aria-hidden />
            Docentes
          </TabsTrigger>
          <TabsTrigger value="grupos">
            <LayoutGrid className="size-4" aria-hidden />
            Grupos
          </TabsTrigger>
        </TabsList>

        <TabsContent value="materias">
          {materias.isPending ? (
            <SkeletonTable rows={8} />
          ) : materias.isError ? (
            <ErrorState error={materias.error} onRetry={() => void materias.refetch()} />
          ) : (
            <DataTable
              rows={materias.data}
              columns={columnasMateria}
              getRowId={(row) => row.subjectId}
              searchQuery={busqueda}
              onClearSearch={() => setQ('')}
              emptyTitle="Sin materias"
              emptyMessage="No hay materias en tus programas para el periodo elegido."
            />
          )}
        </TabsContent>

        <TabsContent value="docentes">
          {docentes.isPending ? (
            <SkeletonTable rows={8} />
          ) : docentes.isError ? (
            <ErrorState error={docentes.error} onRetry={() => void docentes.refetch()} />
          ) : (
            <DataTable
              rows={docentes.data}
              columns={columnasDocente}
              getRowId={(row) => row.userId}
              searchQuery={busqueda}
              onClearSearch={() => setQ('')}
              emptyTitle="Sin docentes"
              emptyMessage="Ningún docente dicta materias de tus programas en este periodo."
            />
          )}
        </TabsContent>

        <TabsContent value="grupos">
          {grupos.isPending ? (
            <SkeletonTable rows={8} />
          ) : grupos.isError ? (
            <ErrorState error={grupos.error} onRetry={() => void grupos.refetch()} />
          ) : (
            <DataTable
              rows={grupos.data}
              columns={columnasGrupo}
              getRowId={(row) => row.groupId}
              searchQuery={busqueda}
              onClearSearch={() => setQ('')}
              emptyTitle="Sin grupos"
              emptyMessage="No hay grupos abiertos en tus programas para el periodo elegido."
            />
          )}
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}
