import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import {
  CalendarClock,
  CheckCircle2,
  Clock,
  Link2,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogFooter,
  EmptyState,
  ErrorState,
  Field,
  Input,
  NativeSelect,
  PageContainer,
  PageHeader,
  SkeletonList,
  Textarea,
} from '@/shared/ui';
import { activitiesRepository } from '@/infrastructure/repositories/activities.repository';
import { subjectRepository } from '@/infrastructure/repositories/academic.repository';
import { periodosRepository } from '@/infrastructure/repositories/administracion.repository';
import { queryKeys } from '@/core/api/query-keys';
import { useUserRole } from '@/state/session.store';
import { can } from '@/core/auth/permissions';
import { toast } from '@/state/toast.store';
import type { Actividad, ActividadInput, EstadoActividad } from '@/domain/schemas/activities';

/**
 * Actividades académicas.
 *
 * El estado que se pinta (`estado`) lo calcula el servidor: `LATE` no está
 * guardado, se deriva del reloj del backend. Aquí no se compara ninguna fecha
 * con `Date.now()` — un equipo con la hora mal puesta mostraría vencida una
 * entrega que no lo está, y el docente no sabría cuál de los dos miente.
 */

const ESTADO: Record<EstadoActividad, { tono: 'success' | 'warning' | 'info'; texto: string; Icono: typeof Clock }> = {
  OPEN: { tono: 'info', texto: 'Abierta', Icono: Clock },
  CLOSED: { tono: 'success', texto: 'Cerrada', Icono: CheckCircle2 },
  LATE: { tono: 'warning', texto: 'Vencida', Icono: CalendarClock },
};

/** Fecha y hora legibles. El backend ya entrega instantes absolutos. */
function fechaHora(iso: string): string {
  const instante = new Date(iso);
  if (Number.isNaN(instante.getTime())) return '—';
  return instante.toLocaleString('es-CO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Valor para un `<input type="datetime-local">`, que no admite zona horaria. */
function aInputLocal(iso: string): string {
  const instante = new Date(iso);
  if (Number.isNaN(instante.getTime())) return '';
  const desfase = instante.getTimezoneOffset() * 60_000;
  return new Date(instante.getTime() - desfase).toISOString().slice(0, 16);
}

const VACIA: ActividadInput = {
  title: '',
  description: '',
  subjectId: '',
  dueAt: '',
  weight: 0,
};

export default function ActivitiesPage() {
  const role = useUserRole();
  const puedeEscribir = can(role, 'activities.write');
  const puedeReabrir = can(role, 'activities.reopen');

  const [parametros, setParametros] = useSearchParams();
  const destacada = parametros.get('item');

  const [subjectId, setSubjectId] = useState('');
  const [period, setPeriod] = useState('');
  const [estado, setEstado] = useState<EstadoActividad | ''>('');
  const [editando, setEditando] = useState<Actividad | null>(null);
  const [creando, setCreando] = useState(false);
  const [borrando, setBorrando] = useState<Actividad | null>(null);
  const [formulario, setFormulario] = useState<ActividadInput>(VACIA);

  const queryClient = useQueryClient();
  const invalidar = () => {
    void queryClient.invalidateQueries({ queryKey: [...queryKeys.activities.all] });
    // La entrega también sale en la agenda: es la misma fuente de fechas.
    void queryClient.invalidateQueries({ queryKey: [...queryKeys.agenda.all] });
  };

  const filtro = useMemo(
    () => ({
      subjectId: subjectId || undefined,
      period: period || undefined,
      estado: estado || undefined,
    }),
    [subjectId, period, estado],
  );

  const listado = useQuery({
    queryKey: queryKeys.activities.list(filtro),
    queryFn: () => activitiesRepository.list(filtro),
  });

  const materias = useQuery({
    queryKey: queryKeys.subjects.list(),
    queryFn: () => subjectRepository.list(),
  });

  const periodos = useQuery({
    queryKey: queryKeys.periods.list(),
    queryFn: () => periodosRepository.list(),
  });

  const nombreDeMateria = useMemo(
    () => new Map((materias.data ?? []).map((materia) => [materia._id, materia.name])),
    [materias.data],
  );

  const guardar = useMutation({
    mutationFn: () =>
      editando
        ? activitiesRepository.update(editando._id, {
            ...formulario,
            dueAt: new Date(formulario.dueAt).toISOString(),
          })
        : activitiesRepository.create({
            ...formulario,
            dueAt: new Date(formulario.dueAt).toISOString(),
          }),
    onSuccess() {
      invalidar();
      cerrarFormulario();
      toast.success(editando ? 'Actividad actualizada' : 'Actividad creada');
    },
    onError: (causa) => toast.fromError(causa, 'No se pudo guardar'),
  });

  const cambiarEstado = useMutation({
    mutationFn: ({ id, abrir }: { id: string; abrir: boolean }) =>
      abrir ? activitiesRepository.reabrir(id) : activitiesRepository.cerrar(id),
    onSuccess: (_dato, variables) => {
      invalidar();
      toast.success(variables.abrir ? 'Actividad reabierta' : 'Actividad cerrada');
    },
    onError: (causa) => toast.fromError(causa, 'No se pudo cambiar el estado'),
  });

  const borrar = useMutation({
    mutationFn: (id: string) => activitiesRepository.remove(id),
    onSuccess() {
      invalidar();
      setBorrando(null);
      toast.success('Actividad eliminada');
    },
    onError: (causa) => toast.fromError(causa, 'No se pudo eliminar'),
  });

  function abrirNueva() {
    setEditando(null);
    setFormulario({ ...VACIA, subjectId, period: period || undefined });
    setCreando(true);
  }

  function abrirEdicion(actividad: Actividad) {
    setEditando(actividad);
    setFormulario({
      title: actividad.title,
      description: actividad.description,
      subjectId: actividad.subjectId,
      groupId: actividad.groupId ?? undefined,
      period: actividad.period || undefined,
      dueAt: aInputLocal(actividad.dueAt),
      weight: actividad.weight,
      attachmentUrl: actividad.attachmentUrl ?? '',
    });
    setCreando(true);
  }

  function cerrarFormulario() {
    setCreando(false);
    setEditando(null);
    setFormulario(VACIA);
  }

  const items = listado.data?.items ?? [];

  return (
    <PageContainer>
      <PageHeader
        title="Actividades"
        subtitle="Talleres, entregas y parciales con fecha límite. El aviso de vencimiento lo manda el servidor."
        actions={
          puedeEscribir ? (
            <Button onClick={abrirNueva}>
              <Plus className="size-4" aria-hidden />
              Nueva actividad
            </Button>
          ) : null
        }
      />

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <Field label="Materia" className="min-w-[220px] flex-1">
            {(props) => (
              <NativeSelect
                {...props}
                value={subjectId}
                onChange={(evento) => setSubjectId(evento.target.value)}
              >
                <option value="">Todas</option>
                {(materias.data ?? []).map((materia) => (
                  <option key={materia._id} value={materia._id}>
                    {materia.name}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>

          <Field label="Periodo" className="min-w-[140px]">
            {(props) => (
              <NativeSelect
                {...props}
                value={period}
                onChange={(evento) => setPeriod(evento.target.value)}
              >
                <option value="">Todos</option>
                {(periodos.data ?? []).map((registro) => (
                  <option key={registro.period} value={registro.period}>
                    {registro.period}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>

          <Field label="Estado" className="min-w-[160px]">
            {(props) => (
              <NativeSelect
                {...props}
                value={estado}
                onChange={(evento) => setEstado(evento.target.value as EstadoActividad | '')}
              >
                <option value="">Todos</option>
                <option value="OPEN">Abiertas</option>
                <option value="LATE">Vencidas</option>
                <option value="CLOSED">Cerradas</option>
              </NativeSelect>
            )}
          </Field>
        </CardContent>
      </Card>

      {listado.isPending ? <SkeletonList rows={6} /> : null}

      {listado.isError ? (
        <ErrorState error={listado.error} onRetry={() => void listado.refetch()} />
      ) : null}

      {listado.isSuccess && items.length === 0 ? (
        <EmptyState
          title="Sin actividades"
          message={
            puedeEscribir
              ? 'Crea la primera para que el servidor avise de su vencimiento.'
              : 'Todavía no hay actividades registradas con estos filtros.'
          }
        />
      ) : null}

      <div className="flex flex-col gap-2">
        {items.map((actividad) => {
          const presentacion = ESTADO[actividad.estado];
          const resaltada = destacada === actividad._id;

          return (
            <Card
              key={actividad._id}
              className={resaltada ? 'ring-2 ring-accent' : undefined}
              // La notificación abre exactamente esta actividad; al tocar
              // cualquier otra se limpia el resalte para no dejarlo pegado.
              onClick={() => resaltada && setParametros({})}
            >
              <CardContent className="flex flex-wrap items-start justify-between gap-3 p-4">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-body font-semibold text-text">
                      {actividad.title}
                    </span>
                    <Badge tone={presentacion.tono}>
                      <presentacion.Icono className="size-3.5" aria-hidden />
                      {presentacion.texto}
                    </Badge>
                    {actividad.weight > 0 ? (
                      <Badge tone="neutral">{Math.round(actividad.weight * 100)}% del corte</Badge>
                    ) : null}
                  </div>

                  <p className="text-caption text-muted">
                    {nombreDeMateria.get(actividad.subjectId) ?? 'Materia'} ·{' '}
                    {actividad.period || 'sin periodo'} · vence {fechaHora(actividad.dueAt)}
                  </p>

                  {actividad.description ? (
                    <p className="line-clamp-2 text-caption text-muted">{actividad.description}</p>
                  ) : null}
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  {actividad.attachmentUrl ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      asChild
                      aria-label="Abrir el archivo adjunto"
                    >
                      <a href={actividad.attachmentUrl} target="_blank" rel="noreferrer">
                        <Link2 className="size-4" aria-hidden />
                      </a>
                    </Button>
                  ) : null}

                  {puedeEscribir ? (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Editar ${actividad.title}`}
                        onClick={() => abrirEdicion(actividad)}
                      >
                        <Pencil className="size-4" aria-hidden />
                      </Button>

                      {actividad.status === 'CLOSED' ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Reabrir ${actividad.title}`}
                          // Reabrir cambia lo que se le puede exigir a un
                          // estudiante pasada la fecha: no es del docente.
                          disabled={!puedeReabrir}
                          title={puedeReabrir ? undefined : 'Reabrir requiere permiso de coordinación.'}
                          onClick={() =>
                            cambiarEstado.mutate({ id: actividad._id, abrir: true })
                          }
                        >
                          <RotateCcw className="size-4" aria-hidden />
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Cerrar ${actividad.title}`}
                          onClick={() =>
                            cambiarEstado.mutate({ id: actividad._id, abrir: false })
                          }
                        >
                          <CheckCircle2 className="size-4" aria-hidden />
                        </Button>
                      )}

                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Eliminar ${actividad.title}`}
                        onClick={() => setBorrando(actividad)}
                      >
                        <Trash2 className="size-4 text-danger" aria-hidden />
                      </Button>
                    </>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={creando} onOpenChange={(abierto) => (abierto ? null : cerrarFormulario())}>
        <DialogContent
          title={editando ? 'Editar actividad' : 'Nueva actividad'}
          description="La fecha límite es lo que decide cuándo avisa el servidor."
        >
          <form
            className="flex flex-col gap-3"
            onSubmit={(evento) => {
              evento.preventDefault();
              guardar.mutate();
            }}
          >
            <Field label="Título" required>
              {(props) => (
                <Input
                  {...props}
                  value={formulario.title}
                  maxLength={200}
                  required
                  onChange={(evento) =>
                    setFormulario((previo) => ({ ...previo, title: evento.target.value }))
                  }
                />
              )}
            </Field>

            <Field label="Materia" required>
              {(props) => (
                <NativeSelect
                  {...props}
                  value={formulario.subjectId}
                  required
                  // Cambiar de materia una actividad ya creada movería la
                  // entrega al listado de otro grupo sin avisar a nadie.
                  disabled={Boolean(editando)}
                  onChange={(evento) =>
                    setFormulario((previo) => ({ ...previo, subjectId: evento.target.value }))
                  }
                >
                  <option value="">Elige una materia</option>
                  {(materias.data ?? []).map((materia) => (
                    <option key={materia._id} value={materia._id}>
                      {materia.name}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>

            <Field label="Fecha y hora límite" required>
              {(props) => (
                <Input
                  {...props}
                  type="datetime-local"
                  value={formulario.dueAt}
                  required
                  onChange={(evento) =>
                    setFormulario((previo) => ({ ...previo, dueAt: evento.target.value }))
                  }
                />
              )}
            </Field>

            <Field label="Peso dentro del corte" hint="0 si no cuenta para la nota.">
              {(props) => (
                <Input
                  {...props}
                  type="number"
                  min={0}
                  max={1}
                  step={0.05}
                  value={formulario.weight}
                  onChange={(evento) =>
                    setFormulario((previo) => ({ ...previo, weight: Number(evento.target.value) }))
                  }
                />
              )}
            </Field>

            <Field label="Enlace o archivo adjunto" hint="Opcional.">
              {(props) => (
                <Input
                  {...props}
                  type="url"
                  value={formulario.attachmentUrl ?? ''}
                  onChange={(evento) =>
                    setFormulario((previo) => ({ ...previo, attachmentUrl: evento.target.value }))
                  }
                />
              )}
            </Field>

            <Field label="Descripción">
              {(props) => (
                <Textarea
                  {...props}
                  rows={3}
                  maxLength={4000}
                  value={formulario.description}
                  onChange={(evento) =>
                    setFormulario((previo) => ({ ...previo, description: evento.target.value }))
                  }
                />
              )}
            </Field>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={cerrarFormulario}>
                Cancelar
              </Button>
              <Button type="submit" loading={guardar.isPending}>
                {editando ? 'Guardar cambios' : 'Crear actividad'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(borrando)}
        onOpenChange={(abierto) => (abierto ? null : setBorrando(null))}
        title="Eliminar actividad"
        description={
          borrando
            ? `«${borrando.title}» dejará de aparecer en la agenda y en los avisos. Los recordatorios ya enviados no se borran.`
            : ''
        }
        loading={borrar.isPending}
        onConfirm={() => borrando && borrar.mutate(borrando._id)}
      />
    </PageContainer>
  );
}
