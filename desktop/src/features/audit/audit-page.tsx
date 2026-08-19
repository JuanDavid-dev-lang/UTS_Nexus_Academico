import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  DataTable,
  Dialog,
  DialogContent,
  EmptyState,
  ErrorState,
  Field,
  Input,
  NativeSelect,
  PageContainer,
  PageHeader,
  SkeletonTable,
  type Column,
} from '@/shared/ui';
import { auditRepository } from '@/infrastructure/repositories/administracion.repository';
import { queryKeys } from '@/core/api/query-keys';
import { useDebounce } from '@/shared/hooks/use-debounce';
import type { RegistroAuditoria } from '@/domain/schemas/administracion';

/**
 * Consulta del registro de auditoría.
 *
 * Lo que se ve aquí llega ya saneado del servidor: contraseñas, tokens y
 * códigos de recuperación no están guardados, no es que se oculten al pintar.
 * Y las filas traen solo QUÉ campos cambiaron; el contenido del antes y el
 * después se pide al abrir un evento, porque una tabla con dos documentos
 * completos por fila no se lee.
 */

function fechaHora(iso?: string): string {
  if (!iso) return '—';
  const instante = new Date(iso);
  return Number.isNaN(instante.getTime())
    ? '—'
    : instante.toLocaleString('es-CO', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
}

/** Pinta un valor arbitrario del `before`/`after` sin asumir su forma. */
function Valor({ dato }: { dato: unknown }) {
  if (dato === null || dato === undefined) {
    return <span className="text-muted">—</span>;
  }
  if (typeof dato === 'object') {
    return (
      <pre className="scrollbar-slim max-h-64 overflow-auto rounded-md bg-surface-alt p-3 text-caption">
        {JSON.stringify(dato, null, 2)}
      </pre>
    );
  }
  return <span className="break-words text-caption">{String(dato)}</span>;
}

export default function AuditPage() {
  const [entity, setEntity] = useState('');
  const [action, setAction] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [texto, setTexto] = useState('');
  const [abierto, setAbierto] = useState<string | null>(null);

  // Sin rebote, escribir nueve letras son nueve consultas sobre una colección
  // que solo crece; ocho de esas respuestas no las ve nadie.
  const busqueda = useDebounce(texto, 350);

  const filtro = useMemo(
    () => ({
      entity: entity || undefined,
      action: action || undefined,
      desde: desde || undefined,
      hasta: hasta || undefined,
      q: busqueda || undefined,
      limit: 200,
    }),
    [entity, action, desde, hasta, busqueda],
  );

  const listado = useQuery({
    queryKey: queryKeys.audit.list(filtro),
    queryFn: () => auditRepository.list(filtro),
  });

  const catalogo = useQuery({
    queryKey: queryKeys.audit.catalogo(),
    queryFn: () => auditRepository.catalogo(),
    staleTime: 5 * 60_000,
  });

  const detalle = useQuery({
    queryKey: queryKeys.audit.detail(abierto ?? ''),
    queryFn: () => auditRepository.get(abierto!),
    enabled: Boolean(abierto),
  });

  const columnas: Column<RegistroAuditoria>[] = [
    {
      key: 'createdAt',
      header: 'Fecha',
      width: '190px',
      sortValue: (fila) => fila.createdAt ?? '',
      cell: (fila) => <span className="font-mono tabular-nums">{fechaHora(fila.createdAt)}</span>,
    },
    {
      key: 'actor',
      header: 'Actor',
      sortValue: (fila) => fila.actorNombre ?? '',
      cell: (fila) => fila.actorNombre ?? <span className="text-muted">Sistema</span>,
    },
    {
      key: 'action',
      header: 'Acción',
      width: '190px',
      sortValue: (fila) => fila.action,
      cell: (fila) => <Badge tone="neutral">{fila.action}</Badge>,
    },
    {
      key: 'entity',
      header: 'Entidad',
      width: '150px',
      sortValue: (fila) => fila.entity,
      cell: (fila) => fila.entity,
    },
    {
      key: 'entityId',
      header: 'Identificador',
      width: '220px',
      cell: (fila) =>
        fila.entityId ? (
          <span className="font-mono text-caption text-muted">{fila.entityId}</span>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
    {
      key: 'campos',
      header: 'Cambios',
      cell: (fila) =>
        fila.camposCambiados.length ? (
          <span className="text-caption text-muted">{fila.camposCambiados.join(', ')}</span>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Auditoría"
        subtitle="Quién cambió qué y cuándo. Las contraseñas, los tokens y los códigos de recuperación no se guardan aquí."
      />

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <Field label="Buscar" className="min-w-[220px] flex-1">
            {(props) => (
              <Input
                {...props}
                placeholder="Acción o entidad"
                value={texto}
                onChange={(evento) => setTexto(evento.target.value)}
              />
            )}
          </Field>

          <Field label="Entidad" className="min-w-[180px]">
            {(props) => (
              <NativeSelect
                {...props}
                value={entity}
                onChange={(evento) => setEntity(evento.target.value)}
              >
                <option value="">Todas</option>
                {(catalogo.data?.entidades ?? []).map((valor) => (
                  <option key={valor} value={valor}>
                    {valor}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>

          <Field label="Acción" className="min-w-[180px]">
            {(props) => (
              <NativeSelect
                {...props}
                value={action}
                onChange={(evento) => setAction(evento.target.value)}
              >
                <option value="">Todas</option>
                {(catalogo.data?.acciones ?? []).map((valor) => (
                  <option key={valor} value={valor}>
                    {valor}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>

          <Field label="Desde" className="min-w-[160px]">
            {(props) => (
              <Input
                {...props}
                type="date"
                value={desde}
                onChange={(evento) => setDesde(evento.target.value)}
              />
            )}
          </Field>

          <Field label="Hasta" className="min-w-[160px]">
            {(props) => (
              <Input
                {...props}
                type="date"
                value={hasta}
                onChange={(evento) => setHasta(evento.target.value)}
              />
            )}
          </Field>

          <Button
            variant="ghost"
            onClick={() => {
              setEntity('');
              setAction('');
              setDesde('');
              setHasta('');
              setTexto('');
            }}
          >
            Limpiar
          </Button>
        </CardContent>
      </Card>

      {listado.isPending ? <SkeletonTable rows={10} columns={6} /> : null}
      {listado.isError ? (
        <ErrorState error={listado.error} onRetry={() => void listado.refetch()} />
      ) : null}

      {listado.isSuccess ? (
        listado.data.items.length === 0 ? (
          <EmptyState
            title="Sin registros"
            message="Ningún cambio coincide con estos filtros."
          />
        ) : (
          <Card>
            <CardContent className="p-0">
              <DataTable
                rows={listado.data.items}
                columns={columnas}
                getRowId={(fila) => fila._id}
                onRowClick={(fila) => setAbierto(fila._id)}
                emptyTitle="Sin registros"
              />
              {listado.data.hasMore ? (
                <p className="border-t border-border p-3 text-caption text-muted">
                  Se muestran los {listado.data.items.length} más recientes de{' '}
                  {listado.data.total}. Acota el rango de fechas para ver los anteriores.
                </p>
              ) : null}
            </CardContent>
          </Card>
        )
      ) : null}

      <Dialog open={Boolean(abierto)} onOpenChange={(v) => (v ? null : setAbierto(null))}>
        <DialogContent
          title="Detalle del cambio"
          description="Antes y después, ya saneados. Un campo marcado como oculto tenía un valor sensible que nunca se guardó."
          className="max-w-3xl"
        >
          {detalle.isPending ? <SkeletonTable rows={4} columns={2} /> : null}
          {detalle.isError ? <ErrorState error={detalle.error} /> : null}

          {detalle.isSuccess ? (
            <div className="flex flex-col gap-4">
              <dl className="grid grid-cols-2 gap-3 text-caption">
                <div>
                  <dt className="text-muted">Fecha</dt>
                  <dd className="font-mono">{fechaHora(detalle.data.createdAt)}</dd>
                </div>
                <div>
                  <dt className="text-muted">Actor</dt>
                  <dd>{detalle.data.actorNombre ?? 'Sistema'}</dd>
                </div>
                <div>
                  <dt className="text-muted">Acción</dt>
                  <dd>{detalle.data.action}</dd>
                </div>
                <div>
                  <dt className="text-muted">Entidad</dt>
                  <dd>
                    {detalle.data.entity}
                    {detalle.data.entityId ? (
                      <span className="ml-1 font-mono text-muted">{detalle.data.entityId}</span>
                    ) : null}
                  </dd>
                </div>
              </dl>

              <div className="grid gap-3 md:grid-cols-2">
                <section className="flex flex-col gap-1">
                  <h3 className="flex items-center gap-1.5 text-caption font-semibold uppercase tracking-wide text-muted">
                    Antes
                  </h3>
                  <Valor dato={detalle.data.before} />
                </section>
                <section className="flex flex-col gap-1">
                  <h3 className="flex items-center gap-1.5 text-caption font-semibold uppercase tracking-wide text-muted">
                    <ShieldCheck className="size-3.5" aria-hidden />
                    Después
                  </h3>
                  <Valor dato={detalle.data.after} />
                </section>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
