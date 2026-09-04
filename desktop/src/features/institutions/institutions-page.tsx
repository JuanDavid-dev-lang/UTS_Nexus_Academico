import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Landmark, Pencil, Plus, Power, Settings2, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  ConfirmDialog,
  DataTable,
  EmptyState,
  ErrorState,
  Field,
  Input,
  PageContainer,
  PageHeader,
  SkeletonTable,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  type Column,
} from '@/shared/ui';
import { institutionsRepository } from '@/infrastructure/repositories/institutions.repository';
import { queryKeys } from '@/core/api/query-keys';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { toast } from '@/state/toast.store';
import { can } from '@/core/auth/permissions';
import { useUserRole } from '@/state/session.store';
import type { Institucion, SolicitudInstitucion } from '@/domain/schemas/institutions';
import { InstitutionFormDialog } from './components/institution-form-dialog';
import { InstitutionConfigDialog } from './components/institution-config-dialog';
import { InstitutionTeachersPanel } from './components/institution-teachers-panel';
import { InstitutionRequestsPanel } from './components/institution-requests-panel';

/**
 * Perfiles institucionales.
 *
 * Una institución deja de ser un texto libre para pasar a ser un perfil: nombre,
 * sigla, alias y —opcional— sus propios cortes y ponderados. Esta pantalla es
 * donde se da de alta, se decide quién puede verla en el registro y se resuelven
 * las solicitudes de docentes que pidieron una institución que todavía no existe.
 * Coordinación y secretaría entran a mirar; solo ADMIN escribe.
 */
export default function InstitutionsPage() {
  const role = useUserRole();
  const queryClient = useQueryClient();
  const puedeGestionar = can(role, 'institutions.manage');

  const [q, setQ] = useState('');
  const busqueda = useDebounce(q, 300);
  const [seleccionada, setSeleccionada] = useState<Institucion | null>(null);
  const [creando, setCreando] = useState(false);
  const [editando, setEditando] = useState<Institucion | null>(null);
  const [configurando, setConfigurando] = useState<Institucion | null>(null);
  const [eliminando, setEliminando] = useState<Institucion | null>(null);
  const [origenSolicitud, setOrigenSolicitud] = useState<SolicitudInstitucion | null>(null);

  const filtro = useMemo(() => ({ q: busqueda.trim() || undefined }), [busqueda]);

  const instituciones = useQuery({
    queryKey: queryKeys.institutions.list(filtro),
    queryFn: () => institutionsRepository.list(filtro),
  });

  const solicitudes = useQuery({
    queryKey: queryKeys.institutions.solicitudes(),
    queryFn: () => institutionsRepository.solicitudes(),
    enabled: role === 'ADMIN',
  });

  function invalidar() {
    void queryClient.invalidateQueries({ queryKey: queryKeys.institutions.all });
  }

  const cambiarEstado = useMutation({
    mutationFn: ({ id, activa }: { id: string; activa: boolean }) => institutionsRepository.actualizar(id, { activa }),
    onSuccess(item) {
      invalidar();
      toast.success(item.activa ? 'Institución activada' : 'Institución desactivada', item.nombre);
    },
    onError: (causa) => toast.fromError(causa, 'No se pudo cambiar el estado'),
  });

  const eliminar = useMutation({
    mutationFn: (id: string) => institutionsRepository.eliminar(id),
    onSuccess(_item, id) {
      invalidar();
      toast.success('Institución eliminada');
      setEliminando(null);
      setSeleccionada((actual) => (actual?.id === id ? null : actual));
    },
    onError(causa) {
      toast.fromError(causa, 'No se pudo eliminar');
      setEliminando(null);
    },
  });

  const columnas = useMemo<Column<Institucion>[]>(() => {
    const base: Column<Institucion>[] = [
      {
        key: 'nombre',
        header: 'Institución',
        width: '2.2fr',
        sortValue: (row) => row.nombre,
        cell: (row) => (
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-medium text-text">{row.nombre}</span>
            <span className="font-mono text-caption text-muted">{row.institutionId}</span>
          </div>
        ),
      },
      { key: 'sigla', header: 'Sigla', width: '0.8fr', cell: (row) => row.sigla },
      {
        key: 'estado',
        header: 'Estado',
        width: '0.9fr',
        align: 'center',
        cell: (row) => <Badge tone={row.activa ? 'success' : 'neutral'}>{row.activa ? 'Activa' : 'Inactiva'}</Badge>,
      },
      {
        key: 'docentes',
        header: 'Docentes',
        width: '0.8fr',
        align: 'center',
        sortValue: (row) => row.docentes ?? 0,
        cell: (row) => row.docentes ?? 0,
      },
      {
        key: 'configuracion',
        header: 'Configuración',
        width: '1.1fr',
        align: 'center',
        cell: (row) => (
          <Badge tone={row.configuracionAcademica ? 'success' : 'warning'}>
            {row.configuracionAcademica ? 'Configurada' : 'Sin configurar'}
          </Badge>
        ),
      },
    ];

    if (puedeGestionar) {
      base.push({
        key: 'acciones',
        header: 'Acciones',
        width: '1.6fr',
        align: 'right',
        cell: (row) => (
          <div className="flex justify-end gap-1.5">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={(event) => {
                event.stopPropagation();
                setEditando(row);
              }}
              aria-label={`Editar ${row.nombre}`}
            >
              <Pencil className="size-4" aria-hidden />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={(event) => {
                event.stopPropagation();
                setConfigurando(row);
              }}
              aria-label={`Configurar ${row.nombre}`}
            >
              <Settings2 className="size-4" aria-hidden />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={(event) => {
                event.stopPropagation();
                cambiarEstado.mutate({ id: row.id, activa: !row.activa });
              }}
              aria-label={row.activa ? `Desactivar ${row.nombre}` : `Activar ${row.nombre}`}
            >
              <Power className="size-4" aria-hidden />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={(event) => {
                event.stopPropagation();
                setEliminando(row);
              }}
              aria-label={`Eliminar ${row.nombre}`}
            >
              <Trash2 className="size-4" aria-hidden />
            </Button>
          </div>
        ),
      });
    }

    return base;
  }, [puedeGestionar, cambiarEstado]);

  const pendientes = solicitudes.data?.length ?? 0;

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Administración"
        title="Perfiles institucionales"
        subtitle={`${instituciones.data?.length ?? 0} instituciones registradas`}
        actions={
          puedeGestionar ? (
            <Button variant="primary" onClick={() => setCreando(true)}>
              <Plus className="size-4" aria-hidden />
              Nueva institución
            </Button>
          ) : undefined
        }
      />

      <Tabs defaultValue="instituciones">
        <TabsList>
          <TabsTrigger value="instituciones">
            <Landmark className="size-3.5" aria-hidden />
            Instituciones
          </TabsTrigger>
          {role === 'ADMIN' && (
            <TabsTrigger value="solicitudes">
              Solicitudes
              {pendientes > 0 && (
                <Badge tone="warning" size="sm">
                  {pendientes}
                </Badge>
              )}
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="instituciones" className="flex flex-col gap-4">
          <Card>
            <CardContent className="p-4">
              <Field label="Buscar" className="max-w-sm">
                {(props) => (
                  <Input {...props} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre, sigla o identificador" />
                )}
              </Field>
            </CardContent>
          </Card>

          {instituciones.isPending ? (
            <SkeletonTable rows={6} columns={5} />
          ) : instituciones.isError ? (
            <ErrorState error={instituciones.error} onRetry={() => void instituciones.refetch()} />
          ) : instituciones.data.length === 0 ? (
            <Card>
              <EmptyState title="Sin instituciones" message="Ninguna institución coincide con la búsqueda." />
            </Card>
          ) : (
            <DataTable rows={instituciones.data} columns={columnas} getRowId={(row) => row.id} onRowClick={setSeleccionada} />
          )}

          {seleccionada && (
            <InstitutionTeachersPanel
              institucion={seleccionada}
              instituciones={instituciones.data ?? []}
              puedeGestionar={puedeGestionar}
            />
          )}
        </TabsContent>

        {role === 'ADMIN' && (
          <TabsContent value="solicitudes">
            {solicitudes.isPending ? (
              <SkeletonTable rows={3} columns={1} />
            ) : solicitudes.isError ? (
              <ErrorState error={solicitudes.error} onRetry={() => void solicitudes.refetch()} />
            ) : (
              <InstitutionRequestsPanel
                solicitudes={solicitudes.data ?? []}
                instituciones={instituciones.data ?? []}
                puedeGestionar={puedeGestionar}
                onCrearPerfil={setOrigenSolicitud}
              />
            )}
          </TabsContent>
        )}
      </Tabs>

      {creando && <InstitutionFormDialog onClose={() => setCreando(false)} />}
      {editando && <InstitutionFormDialog institucion={editando} onClose={() => setEditando(null)} />}
      {origenSolicitud && (
        <InstitutionFormDialog
          nombreInicial={origenSolicitud.institucionSolicitada}
          profesorId={origenSolicitud.id}
          onClose={() => setOrigenSolicitud(null)}
        />
      )}
      {configurando && <InstitutionConfigDialog institucion={configurando} onClose={() => setConfigurando(null)} />}

      <ConfirmDialog
        open={Boolean(eliminando)}
        onOpenChange={(abierto) => !abierto && setEliminando(null)}
        title="Eliminar institución"
        description={
          eliminando
            ? `${eliminando.nombre} se elimina del catálogo. Si tiene docentes vinculados, el servidor lo rechaza: desactívala en su lugar.`
            : ''
        }
        confirmLabel="Eliminar"
        loading={eliminar.isPending}
        onConfirm={() => eliminando && eliminar.mutate(eliminando.id)}
      />
    </PageContainer>
  );
}
