import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  CircleSlash,
  RefreshCw,
  Settings,
  Timer,
  XCircle,
} from 'lucide-react';
import { Link } from 'react-router-dom';
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
  NativeSelect,
  PageContainer,
  PageHeader,
  SkeletonList,
  StatCard,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/shared/ui';
import {
  healthRepository,
  telemetryRepository,
} from '@/infrastructure/repositories/administracion.repository';
import { queryKeys } from '@/core/api/query-keys';
import { useUserRole } from '@/state/session.store';
import { can } from '@/core/auth/permissions';
import { toast } from '@/state/toast.store';
import type { EstadoServicio } from '@/domain/schemas/administracion';

/**
 * Centro de salud del sistema.
 *
 * Distingue cuatro estados y no dos, porque «rojo o verde» miente: un SMTP que
 * nadie quiso configurar aparecería en rojo para siempre, y el rojo dejaría de
 * significar «hay que mirar esto». Aquí «desactivado» es una decisión, no una
 * avería.
 */

const ESTADO: Record<
  EstadoServicio,
  { tono: 'success' | 'info' | 'neutral' | 'danger'; texto: string; Icono: typeof CheckCircle2 }
> = {
  saludable: { tono: 'success', texto: 'Saludable', Icono: CheckCircle2 },
  configurado: { tono: 'info', texto: 'Configurado', Icono: Settings },
  desactivado: { tono: 'neutral', texto: 'Desactivado', Icono: CircleSlash },
  error: { tono: 'danger', texto: 'Con error', Icono: XCircle },
};

function relativo(iso: string | null): string {
  if (!iso) return 'nunca';
  const instante = new Date(iso).getTime();
  if (Number.isNaN(instante)) return 'nunca';
  const segundos = Math.round((Date.now() - instante) / 1000);
  if (segundos < 60) return 'hace menos de un minuto';
  if (segundos < 3600) return `hace ${Math.round(segundos / 60)} min`;
  if (segundos < 86_400) return `hace ${Math.round(segundos / 3600)} h`;
  return `hace ${Math.round(segundos / 86_400)} días`;
}

function duracion(segundos: number): string {
  const dias = Math.floor(segundos / 86_400);
  const horas = Math.floor((segundos % 86_400) / 3600);
  const minutos = Math.floor((segundos % 3600) / 60);
  if (dias > 0) return `${dias} d ${horas} h`;
  if (horas > 0) return `${horas} h ${minutos} min`;
  return `${minutos} min`;
}

export default function HealthPage() {
  const role = useUserRole();
  const puedeGestionarErrores = can(role, 'telemetry.manage');

  const [estadoErrores, setEstadoErrores] = useState<'ABIERTO' | 'RESUELTO' | 'IGNORADO'>('ABIERTO');
  const [cliente, setCliente] = useState<'desktop' | 'mobile' | ''>('');

  const queryClient = useQueryClient();

  const salud = useQuery({
    queryKey: queryKeys.system.health(),
    queryFn: () => healthRepository.estado(),
    // Se refresca solo cada minuto: es un panel que se deja abierto mientras se
    // diagnostica, y un dato de hace media hora no diagnostica nada.
    refetchInterval: 60_000,
  });

  const filtroErrores = useMemo(
    () => ({ status: estadoErrores, client: cliente || undefined, limit: 100 }),
    [estadoErrores, cliente],
  );

  const errores = useQuery({
    queryKey: queryKeys.telemetry.list(filtroErrores),
    queryFn: () => telemetryRepository.list(filtroErrores),
  });

  const marcar = useMutation({
    mutationFn: ({ id, estado }: { id: string; estado: 'ABIERTO' | 'RESUELTO' | 'IGNORADO' }) =>
      telemetryRepository.setEstado(id, estado),
    onSuccess() {
      void queryClient.invalidateQueries({ queryKey: [...queryKeys.telemetry.all] });
      void queryClient.invalidateQueries({ queryKey: [...queryKeys.system.all] });
    },
    onError: (causa) => toast.fromError(causa, 'No se pudo cambiar el estado'),
  });

  return (
    <PageContainer>
      <PageHeader
        title="Estado del sistema"
        subtitle="Integraciones, tareas periódicas y defectos reportados por los clientes."
        actions={
          <Button variant="ghost" onClick={() => void salud.refetch()} loading={salud.isFetching}>
            <RefreshCw className="size-4" aria-hidden />
            Volver a comprobar
          </Button>
        }
      />

      {salud.isPending ? <SkeletonList rows={5} /> : null}
      {salud.isError ? <ErrorState error={salud.error} onRetry={() => void salud.refetch()} /> : null}

      {salud.isSuccess ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Versión del backend" value={salud.data.version} />
            <StatCard label="Tiempo activo" value={duracion(salud.data.uptimeSegundos)} />
            <StatCard
              label="Fuente del riesgo"
              value={salud.data.riesgo.fuente === 'model' ? 'Modelo ML' : 'Reglas'}
              hint={salud.data.riesgo.detalle}
              tone={salud.data.riesgo.fuente === 'model' ? 'success' : 'warning'}
            />
            <StatCard
              label="Errores abiertos"
              value={salud.data.errores.abiertos}
              tone={salud.data.errores.abiertos > 0 ? 'danger' : 'success'}
            />
          </div>

          {/*
            Con varias instancias, el tiempo activo y la versión son de ESTA;
            las tareas se leen de la base y sí valen para el despliegue entero.
            Presentar lo primero como global sería mentir en la pantalla que
            existe para no mentir.
          */}
          <p className="text-caption text-muted">
            Instancia <span className="font-mono">{salud.data.instancia}</span>.{' '}
            {salud.data.avisoMultiInstancia}
          </p>

          <Tabs defaultValue="servicios">
            <TabsList>
              <TabsTrigger value="servicios">Integraciones</TabsTrigger>
              <TabsTrigger value="tareas">Tareas periódicas</TabsTrigger>
              <TabsTrigger value="errores">Errores de clientes</TabsTrigger>
            </TabsList>

            {/* ── Integraciones ────────────────────────────────────────── */}
            <TabsContent value="servicios" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {salud.data.servicios.map((servicio) => {
                const presentacion = ESTADO[servicio.estado];
                return (
                  <Card key={servicio.clave}>
                    <CardHeader className="flex flex-row items-start justify-between gap-2">
                      <CardTitle className="text-body">{servicio.nombre}</CardTitle>
                      <Badge tone={presentacion.tono}>
                        <presentacion.Icono className="size-3.5" aria-hidden />
                        {presentacion.texto}
                      </Badge>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-2">
                      <p className="text-caption text-muted">{servicio.detalle}</p>
                      <p className="text-caption text-muted">
                        Comprobado {relativo(servicio.comprobadoEn)}
                      </p>
                      {servicio.enlace ? (
                        <Link
                          to={servicio.enlace}
                          className="text-caption font-semibold text-primary hover:underline"
                        >
                          Ir a la configuración
                        </Link>
                      ) : null}
                    </CardContent>
                  </Card>
                );
              })}
            </TabsContent>

            {/* ── Tareas ───────────────────────────────────────────────── */}
            <TabsContent value="tareas" className="flex flex-col gap-2">
              {salud.data.tareas.map((tarea) => (
                <Card key={tarea.job}>
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div className="flex min-w-0 flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-body font-semibold text-text">{tarea.nombre}</span>
                        {tarea.activa ? (
                          <Badge tone="success">
                            <Timer className="size-3.5" aria-hidden />
                            Cada {tarea.intervaloMin} min
                          </Badge>
                        ) : (
                          <Badge tone="neutral">
                            <CircleSlash className="size-3.5" aria-hidden />
                            Desactivada
                          </Badge>
                        )}
                        {tarea.fallos > 0 ? (
                          <Badge tone="danger">
                            <AlertTriangle className="size-3.5" aria-hidden />
                            {tarea.fallos} fallo{tarea.fallos === 1 ? '' : 's'}
                          </Badge>
                        ) : null}
                      </div>
                      <p className="text-caption text-muted">
                        Última ejecución {relativo(tarea.ultimaEjecucion)} · último éxito{' '}
                        {relativo(tarea.ultimoExito)} · {tarea.ejecuciones} pasada(s)
                        {tarea.instancia ? ` · en ${tarea.instancia}` : ''}
                      </p>
                      {tarea.ultimoError ? (
                        <p className="text-caption font-medium text-danger">{tarea.ultimoError}</p>
                      ) : null}
                    </div>

                    {Object.keys(tarea.ultimoResultado).length > 0 ? (
                      <dl className="flex flex-wrap gap-3 text-caption">
                        {Object.entries(tarea.ultimoResultado).map(([clave, valor]) => (
                          <div key={clave} className="flex flex-col">
                            <dt className="text-muted">{clave}</dt>
                            <dd className="font-mono tabular-nums">{String(valor)}</dd>
                          </div>
                        ))}
                      </dl>
                    ) : null}
                  </CardContent>
                </Card>
              ))}
            </TabsContent>

            {/* ── Telemetría ───────────────────────────────────────────── */}
            <TabsContent value="errores" className="flex flex-col gap-3">
              <Card>
                <CardContent className="flex flex-wrap items-end gap-3 p-4">
                  <Field label="Estado" className="min-w-[160px]">
                    {(props) => (
                      <NativeSelect
                        {...props}
                        value={estadoErrores}
                        onChange={(evento) =>
                          setEstadoErrores(evento.target.value as typeof estadoErrores)
                        }
                      >
                        <option value="ABIERTO">Abiertos</option>
                        <option value="RESUELTO">Resueltos</option>
                        <option value="IGNORADO">Ignorados</option>
                      </NativeSelect>
                    )}
                  </Field>

                  <Field label="Cliente" className="min-w-[160px]">
                    {(props) => (
                      <NativeSelect
                        {...props}
                        value={cliente}
                        onChange={(evento) => setCliente(evento.target.value as typeof cliente)}
                      >
                        <option value="">Todos</option>
                        <option value="desktop">Escritorio</option>
                        <option value="mobile">Móvil</option>
                      </NativeSelect>
                    )}
                  </Field>
                </CardContent>
              </Card>

              {errores.isPending ? <SkeletonList rows={4} /> : null}
              {errores.isError ? <ErrorState error={errores.error} /> : null}

              {errores.isSuccess && errores.data.items.length === 0 ? (
                <EmptyState
                  title="Sin errores"
                  message="Ningún cliente ha reportado defectos con estos filtros."
                />
              ) : null}

              {(errores.data?.items ?? []).map((error) => (
                <Card key={error._id}>
                  <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
                    <div className="flex min-w-0 flex-col gap-1">
                      <CardTitle className="text-body">{error.message || 'Sin mensaje'}</CardTitle>
                      <CardDescription>
                        {error.client === 'desktop' ? 'Escritorio' : 'Móvil'}{' '}
                        {error.appVersion || 'sin versión'} · {error.platform || 'plataforma sin declarar'} ·{' '}
                        {error.route || 'ruta sin declarar'}
                      </CardDescription>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <Badge tone={error.occurrences > 20 ? 'danger' : 'warning'}>
                        {error.occurrences} vez{error.occurrences === 1 ? '' : 'es'}
                      </Badge>
                      <Badge tone="neutral">{error.category}</Badge>
                    </div>
                  </CardHeader>

                  <CardContent className="flex flex-col gap-2">
                    <p className="text-caption text-muted">
                      Primera vez {relativo(error.firstSeenAt ?? null)} · última{' '}
                      {relativo(error.lastSeenAt ?? null)}
                    </p>

                    {error.context ? (
                      <pre className="scrollbar-slim max-h-40 overflow-auto rounded-md bg-surface-alt p-3 text-caption">
                        {error.context}
                      </pre>
                    ) : null}

                    {puedeGestionarErrores ? (
                      <div className="flex flex-wrap gap-2">
                        {error.status !== 'RESUELTO' ? (
                          <Button
                            variant="ghost"
                            onClick={() => marcar.mutate({ id: error._id, estado: 'RESUELTO' })}
                          >
                            <CheckCircle2 className="size-4" aria-hidden />
                            Marcar resuelto
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            onClick={() => marcar.mutate({ id: error._id, estado: 'ABIERTO' })}
                          >
                            Reabrir
                          </Button>
                        )}
                        {error.status !== 'IGNORADO' ? (
                          <Button
                            variant="ghost"
                            onClick={() => marcar.mutate({ id: error._id, estado: 'IGNORADO' })}
                          >
                            Ignorar
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              ))}
            </TabsContent>
          </Tabs>
        </>
      ) : null}
    </PageContainer>
  );
}
