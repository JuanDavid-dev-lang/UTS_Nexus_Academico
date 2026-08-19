import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, CheckCircle2, Loader2, Lock, RotateCcw, Unlock, XCircle } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogFooter,
  EmptyState,
  ErrorState,
  Field,
  PageContainer,
  PageHeader,
  Progress,
  SkeletonList,
  StatCard,
  Textarea,
} from '@/shared/ui';
import { periodosRepository } from '@/infrastructure/repositories/administracion.repository';
import { queryKeys } from '@/core/api/query-keys';
import { useUserRole } from '@/state/session.store';
import { can } from '@/core/auth/permissions';
import { toast } from '@/state/toast.store';
import type { EstadoPeriodo, Periodo } from '@/domain/schemas/administracion';

/**
 * Cierre oficial de periodos académicos.
 *
 * Cerrar un semestre bloquea las notas, la asistencia y las matrículas de toda
 * la institución y congela una fotografía definitiva. Esta pantalla existe para
 * que esa operación sea explícita, con su progreso a la vista y su
 * responsable anotado — no un botón que «hace algo» y devuelve un tic verde.
 */

const ESTADO: Record<
  EstadoPeriodo,
  { tono: 'success' | 'warning' | 'info'; texto: string; Icono: typeof Lock }
> = {
  OPEN: { tono: 'success', texto: 'Abierto', Icono: Unlock },
  CLOSING: { tono: 'warning', texto: 'Cerrándose', Icono: Loader2 },
  CLOSED: { tono: 'info', texto: 'Cerrado', Icono: Lock },
};

function fecha(iso: string | null): string {
  if (!iso) return '—';
  const instante = new Date(iso);
  return Number.isNaN(instante.getTime())
    ? '—'
    : instante.toLocaleString('es-CO', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
}

export default function PeriodsPage() {
  const role = useUserRole();
  const puedeCerrar = can(role, 'periods.close');
  const puedeReabrir = can(role, 'periods.reopen');

  const [seleccionado, setSeleccionado] = useState<Periodo | null>(null);
  const [reabriendo, setReabriendo] = useState<Periodo | null>(null);
  const [motivo, setMotivo] = useState('');
  const [confirmandoCierre, setConfirmandoCierre] = useState<Periodo | null>(null);

  const queryClient = useQueryClient();
  const invalidar = () =>
    void queryClient.invalidateQueries({ queryKey: [...queryKeys.periods.all] });

  const listado = useQuery({
    queryKey: queryKeys.periods.list(),
    queryFn: () => periodosRepository.list(),
    /**
     * Mientras hay un cierre en marcha se refresca solo.
     *
     * El cierre puede tardar minutos y el progreso vive en el servidor; sin
     * esto, la barra se quedaría clavada donde estaba cuando se abrió la
     * pantalla y quien la mirara concluiría que se colgó.
     */
    refetchInterval: (consulta) =>
      (consulta.state.data ?? []).some((registro) => registro.state === 'CLOSING') ? 3_000 : false,
  });

  const fotografia = useQuery({
    queryKey: queryKeys.periods.snapshot(seleccionado?.period ?? '', { limit: 100 }),
    queryFn: () => periodosRepository.fotografia(seleccionado!.period, { limit: 100 }),
    enabled: Boolean(seleccionado),
  });

  const cerrar = useMutation({
    mutationFn: (period: string) => periodosRepository.cerrar(period),
    onSuccess(resultado) {
      invalidar();
      setConfirmandoCierre(null);
      toast.success(
        resultado.reanudado ? 'Cierre retomado y terminado' : 'Periodo cerrado',
        `${resultado.registros} registro(s) en la fotografía oficial.`,
      );
    },
    onError: (causa) => toast.fromError(causa, 'No se pudo cerrar el periodo'),
  });

  const abortar = useMutation({
    mutationFn: (period: string) => periodosRepository.abortarCierre(period),
    onSuccess() {
      invalidar();
      toast.success('Cierre abortado', 'El periodo vuelve a admitir cambios.');
    },
    onError: (causa) => toast.fromError(causa, 'No se pudo abortar'),
  });

  const reabrir = useMutation({
    mutationFn: ({ period, razon }: { period: string; razon: string }) =>
      periodosRepository.reabrir(period, razon),
    onSuccess() {
      invalidar();
      setReabriendo(null);
      setMotivo('');
      toast.success('Periodo reabierto', 'La fotografía anterior se conserva con su traza.');
    },
    onError: (causa) => toast.fromError(causa, 'No se pudo reabrir'),
  });

  const periodos = listado.data ?? [];

  return (
    <PageContainer>
      <PageHeader
        title="Periodos académicos"
        subtitle="Cerrar un semestre bloquea notas, asistencia y matrículas, y congela el consolidado oficial."
      />

      {listado.isPending ? <SkeletonList rows={4} /> : null}
      {listado.isError ? (
        <ErrorState error={listado.error} onRetry={() => void listado.refetch()} />
      ) : null}

      {listado.isSuccess && periodos.length === 0 ? (
        <EmptyState
          title="Sin periodos"
          message="Aparecerán en cuanto existan notas o matrículas con un semestre asignado."
        />
      ) : null}

      <div className="flex flex-col gap-3">
        {periodos.map((periodo) => {
          const presentacion = ESTADO[periodo.state];
          const enCurso = periodo.state === 'CLOSING';

          return (
            <Card key={periodo.period}>
              <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-1">
                  <CardTitle className="flex flex-wrap items-center gap-2">
                    {periodo.period}
                    <Badge tone={presentacion.tono}>
                      <presentacion.Icono
                        className={enCurso ? 'size-3.5 animate-spin' : 'size-3.5'}
                        aria-hidden
                      />
                      {presentacion.texto}
                    </Badge>
                    {periodo.implicito ? (
                      <Badge tone="neutral" title="Existe por los datos, todavía sin registro propio.">
                        Histórico
                      </Badge>
                    ) : null}
                    {periodo.reaperturas > 0 ? (
                      <Badge tone="warning">
                        {periodo.reaperturas} reapertura{periodo.reaperturas === 1 ? '' : 's'}
                      </Badge>
                    ) : null}
                  </CardTitle>
                  <CardDescription>
                    {periodo.state === 'CLOSED'
                      ? `Cerrado el ${fecha(periodo.closedAt)} · fotografía v${periodo.snapshotVersion}`
                      : periodo.state === 'CLOSING'
                        ? `Cierre iniciado el ${fecha(periodo.closingStartedAt)}`
                        : 'Admite cambios académicos con normalidad.'}
                  </CardDescription>
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {periodo.state === 'CLOSED' ? (
                    <>
                      <Button variant="ghost" onClick={() => setSeleccionado(periodo)}>
                        <Archive className="size-4" aria-hidden />
                        Ver fotografía
                      </Button>
                      {puedeReabrir ? (
                        <Button variant="ghost" onClick={() => setReabriendo(periodo)}>
                          <RotateCcw className="size-4" aria-hidden />
                          Reabrir
                        </Button>
                      ) : null}
                    </>
                  ) : null}

                  {periodo.state === 'OPEN' && puedeCerrar ? (
                    <Button onClick={() => setConfirmandoCierre(periodo)}>
                      <Lock className="size-4" aria-hidden />
                      Cerrar periodo
                    </Button>
                  ) : null}

                  {periodo.state === 'CLOSING' && puedeCerrar ? (
                    <>
                      <Button
                        loading={cerrar.isPending}
                        onClick={() => cerrar.mutate(periodo.period)}
                      >
                        Retomar cierre
                      </Button>
                      {puedeReabrir ? (
                        <Button
                          variant="ghost"
                          loading={abortar.isPending}
                          onClick={() => abortar.mutate(periodo.period)}
                        >
                          <XCircle className="size-4" aria-hidden />
                          Abortar
                        </Button>
                      ) : null}
                    </>
                  ) : null}
                </div>
              </CardHeader>

              {enCurso || periodo.progresoDetalle.total > 0 ? (
                <CardContent className="flex flex-col gap-2">
                  <Progress value={periodo.progreso} />
                  <p className="text-caption text-muted">
                    {periodo.progresoDetalle.done} de {periodo.progresoDetalle.total} registros ·{' '}
                    {periodo.progreso}%
                  </p>
                  {periodo.progresoDetalle.lastError ? (
                    <p className="text-caption font-medium text-danger">
                      Último error: {periodo.progresoDetalle.lastError}
                    </p>
                  ) : null}
                </CardContent>
              ) : null}

              {periodo.state === 'CLOSED' && Object.keys(periodo.snapshotSummary).length > 0 ? (
                <CardContent className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <StatCard
                    label="Registros"
                    value={periodo.snapshotSummary.registros ?? 0}
                    hint="Estudiante × materia"
                  />
                  <StatCard
                    label="Aprobados"
                    value={periodo.snapshotSummary.aprobados ?? 0}
                    tone="success"
                  />
                  <StatCard
                    label="Reprobados"
                    value={periodo.snapshotSummary.reprobados ?? 0}
                    tone="danger"
                  />
                  <StatCard
                    label="Promedio general"
                    value={(periodo.snapshotSummary.promedioGeneral ?? 0).toFixed(2)}
                    tone="info"
                  />
                </CardContent>
              ) : null}
            </Card>
          );
        })}
      </div>

      {/* ── Confirmación del cierre ───────────────────────────────────── */}
      <Dialog
        open={Boolean(confirmandoCierre)}
        onOpenChange={(abierto) => (abierto ? null : setConfirmandoCierre(null))}
      >
        <DialogContent
          title={`Cerrar el periodo ${confirmandoCierre?.period ?? ''}`}
          description="Es la operación más consecuente de la aplicación. Lee lo que implica antes de continuar."
        >
          <ul className="flex flex-col gap-2 text-body text-muted">
            <li>· Notas, asistencia y matrículas de ese semestre dejan de admitir cambios.</li>
            <li>· Se congela una fotografía por estudiante y materia con el consolidado oficial.</li>
            <li>· Horarios, actividades y avisos siguen siendo editables.</li>
            <li>· Queda registrado quién lo cerró y cuándo.</li>
            <li>
              · Si el proceso se interrumpe, el periodo queda «cerrándose» y se puede retomar:
              nunca queda cerrado con la fotografía a medias.
            </li>
          </ul>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmandoCierre(null)}>
              Cancelar
            </Button>
            <Button
              loading={cerrar.isPending}
              onClick={() => confirmandoCierre && cerrar.mutate(confirmandoCierre.period)}
            >
              <CheckCircle2 className="size-4" aria-hidden />
              Cerrar periodo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Reapertura ────────────────────────────────────────────────── */}
      <Dialog
        open={Boolean(reabriendo)}
        onOpenChange={(abierto) => (abierto ? null : setReabriendo(null))}
      >
        <DialogContent
          title={`Reabrir el periodo ${reabriendo?.period ?? ''}`}
          description="La fotografía anterior NO se borra: queda su versión y su traza. El motivo es obligatorio."
        >
          <Field
            label="Motivo de la reapertura"
            hint="Mínimo 10 caracteres. Es lo que explicará, dentro de un año, por qué el consolidado cambió."
            required
          >
            {(props) => (
              <Textarea
                {...props}
                rows={3}
                maxLength={500}
                value={motivo}
                onChange={(evento) => setMotivo(evento.target.value)}
              />
            )}
          </Field>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setReabriendo(null)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              disabled={motivo.trim().length < 10}
              loading={reabrir.isPending}
              onClick={() =>
                reabriendo && reabrir.mutate({ period: reabriendo.period, razon: motivo.trim() })
              }
            >
              Reabrir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Fotografía ────────────────────────────────────────────────── */}
      <Dialog
        open={Boolean(seleccionado)}
        onOpenChange={(abierto) => (abierto ? null : setSeleccionado(null))}
      >
        <DialogContent
          title={`Fotografía de ${seleccionado?.period ?? ''}`}
          description="Consolidado congelado en el momento del cierre. No se recalcula al abrirlo."
          className="max-w-3xl"
        >
          {fotografia.isPending ? <SkeletonList rows={6} /> : null}
          {fotografia.isError ? <ErrorState error={fotografia.error} /> : null}

          {fotografia.isSuccess ? (
            <div className="flex flex-col gap-2">
              <p className="text-caption text-muted">
                {fotografia.data.total} registro(s)
                {fotografia.data.hasMore ? ' · se muestran los primeros 100' : ''}
              </p>
              <div className="scrollbar-slim max-h-[50vh] overflow-y-auto">
                <table className="w-full text-caption">
                  <thead className="sticky top-0 bg-surface text-left text-muted">
                    <tr>
                      <th className="p-2">Cédula</th>
                      <th className="p-2">Estudiante</th>
                      <th className="p-2 text-right">Final</th>
                      <th className="p-2 text-right">Asistencia</th>
                      <th className="p-2">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fotografia.data.items.map((fila) => (
                      <tr key={fila._id} className="border-t border-border">
                        <td className="p-2 font-mono tabular-nums">{fila.code}</td>
                        <td className="p-2">{fila.fullName}</td>
                        <td className="p-2 text-right font-mono tabular-nums">
                          {fila.notaFinal.toFixed(2)}
                        </td>
                        <td className="p-2 text-right font-mono tabular-nums">
                          {fila.asistenciaPorcentaje.toFixed(1)}%
                        </td>
                        <td className="p-2">
                          <Badge tone={fila.aprobado ? 'success' : 'danger'}>
                            {fila.aprobado ? 'Aprobado' : 'Reprobado'}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
