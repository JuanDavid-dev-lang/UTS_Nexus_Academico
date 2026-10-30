import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus, Search } from 'lucide-react';
import {
  Button,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Input,
  NativeSelect,
  PageContainer,
  PageHeader,
  SkeletonList,
  Tabs,
  TabsList,
  TabsTrigger,
} from '@/shared/ui';
import { activitiesRepository } from '@/infrastructure/repositories/activities.repository';
import { subjectRepository } from '@/infrastructure/repositories/academic.repository';
import { periodosRepository } from '@/infrastructure/repositories/administracion.repository';
import { queryKeys } from '@/core/api/query-keys';
import { useUserRole } from '@/state/session.store';
import { can } from '@/core/auth/permissions';
import { toast } from '@/state/toast.store';
import { useSinMovimiento } from '@/shared/hooks/use-sin-movimiento';
import { useAhora } from '@/features/agenda/hooks/use-agenda';
import { OFFSET_CAMPUS_POR_DEFECTO } from '@/domain/agenda/calendar';
import { agruparActividades, contarPorEstado } from '@/domain/activities/linea-de-tiempo';
import { ActivityCard } from '@/features/activities/components/activity-card';
import { ActivityFormDialog } from '@/features/activities/components/activity-form-dialog';
import { CalendarioActividades } from '@/features/activities/components/calendario-actividades';
import type { Actividad, EstadoActividad } from '@/domain/schemas/activities';

/**
 * Actividades académicas: una línea de tiempo con lo urgente arriba y, al
 * lado, el mes con las entregas y lo que trae la agenda cada día.
 *
 * El estado que se pinta (`estado`) lo calcula el servidor: `LATE` no está
 * guardado, se deriva del reloj del backend. Aquí no se decide si algo está
 * vencido — un equipo con la hora mal puesta mostraría vencida una entrega que
 * no lo está, y el docente no sabría cuál de los dos miente. El reparto en
 * «hoy», «mañana» y «esta semana» sí usa el reloj local: es presentación.
 */

type FiltroEstado = EstadoActividad | 'TODAS';

export default function ActivitiesPage() {
  const role = useUserRole();
  const puedeEscribir = can(role, 'activities.write');
  const puedeReabrir = can(role, 'activities.reopen');
  const sinMovimiento = useSinMovimiento();
  const ahora = useAhora(60_000);
  const offset = OFFSET_CAMPUS_POR_DEFECTO;

  const [parametros, setParametros] = useSearchParams();
  const destacada = parametros.get('item');

  const [subjectId, setSubjectId] = useState('');
  const [period, setPeriod] = useState('');
  const [estado, setEstado] = useState<FiltroEstado>('TODAS');
  const [busqueda, setBusqueda] = useState('');
  // El formulario se monta de nuevo en cada apertura (`claveFormulario`): así
  // siempre parte de la actividad elegida y no de lo que quedó escrito.
  const [formulario, setFormulario] = useState<{ actividad: Actividad | null; clave: number } | null>(null);
  const [borrando, setBorrando] = useState<Actividad | null>(null);

  const queryClient = useQueryClient();
  const invalidar = () => {
    void queryClient.invalidateQueries({ queryKey: [...queryKeys.activities.all] });
    // La entrega también sale en la agenda: es la misma fuente de fechas.
    void queryClient.invalidateQueries({ queryKey: [...queryKeys.agenda.all] });
  };

  // El estado se filtra en la pantalla y no en el servidor: las pestañas
  // enseñan cuántas hay de cada uno, y para contarlas hace falta la lista
  // entera. Sigue siendo el `estado` que mandó el servidor.
  const filtro = useMemo(
    () => ({ subjectId: subjectId || undefined, period: period || undefined }),
    [subjectId, period],
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
  const materiaDe = (id: string) => nombreDeMateria.get(id) ?? 'Materia';

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

  const todas = useMemo(() => listado.data?.items ?? [], [listado.data]);
  const cuenta = useMemo(() => contarPorEstado(todas), [todas]);

  const visibles = useMemo(() => {
    const texto = busqueda.trim().toLocaleLowerCase('es');
    return todas.filter(
      (actividad) =>
        (estado === 'TODAS' || actividad.estado === estado) &&
        (!texto || actividad.title.toLocaleLowerCase('es').includes(texto)),
    );
  }, [todas, estado, busqueda]);

  const grupos = useMemo(() => agruparActividades(visibles, ahora, offset), [visibles, ahora, offset]);

  // Desde una notificación o desde la agenda: llevar la vista a esa actividad.
  useEffect(() => {
    if (!destacada || todas.length === 0) return;
    document.getElementById(`actividad-${destacada}`)?.scrollIntoView({
      behavior: sinMovimiento ? 'auto' : 'smooth',
      block: 'center',
    });
  }, [destacada, todas.length, sinMovimiento]);

  function enfocar(id: string) {
    setEstado('TODAS');
    setBusqueda('');
    setParametros({ item: id });
  }

  const pestanas: { valor: FiltroEstado; texto: string; total: number }[] = [
    { valor: 'TODAS', texto: 'Todas', total: todas.length },
    { valor: 'OPEN', texto: 'Abiertas', total: cuenta.OPEN },
    { valor: 'LATE', texto: 'Vencidas', total: cuenta.LATE },
    { valor: 'CLOSED', texto: 'Cerradas', total: cuenta.CLOSED },
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Actividades"
        subtitle="Talleres, entregas y parciales con fecha límite, junto a lo que trae la agenda cada día."
        actions={
          puedeEscribir ? (
            <Button onClick={() => setFormulario({ actividad: null, clave: Date.now() })}>
              <Plus className="size-4" aria-hidden />
              Nueva actividad
            </Button>
          ) : null
        }
      />

      <div className="surface-well flex flex-wrap items-center gap-3 p-2 pl-3">
        <Tabs value={estado} onValueChange={(valor) => setEstado(valor as FiltroEstado)}>
          <TabsList className="bg-surface-hover">
            {pestanas.map((pestana) => (
              <TabsTrigger key={pestana.valor} value={pestana.valor}>
                {pestana.texto}
                <span className="ml-1.5 text-caption text-muted tabular">{pestana.total}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden />
          <Input
            value={busqueda}
            onChange={(evento) => setBusqueda(evento.target.value)}
            placeholder="Buscar por título"
            aria-label="Buscar actividades por título"
            className="h-9 pl-8"
          />
        </div>

        <NativeSelect
          value={subjectId}
          onChange={(evento) => setSubjectId(evento.target.value)}
          aria-label="Filtrar por materia"
          className="h-9 w-56"
        >
          <option value="">Todas las materias</option>
          {(materias.data ?? []).map((materia) => (
            <option key={materia._id} value={materia._id}>
              {materia.name}
            </option>
          ))}
        </NativeSelect>

        <NativeSelect
          value={period}
          onChange={(evento) => setPeriod(evento.target.value)}
          aria-label="Filtrar por periodo"
          className="h-9 w-32"
        >
          <option value="">Periodos</option>
          {(periodos.data ?? []).map((registro) => (
            <option key={registro.period} value={registro.period}>
              {registro.period}
            </option>
          ))}
        </NativeSelect>
      </div>

      <div className="grid items-start gap-4 @4xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-5">
          {listado.isPending ? <SkeletonList rows={6} /> : null}

          {listado.isError ? <ErrorState error={listado.error} onRetry={() => void listado.refetch()} /> : null}

          {listado.isSuccess && grupos.length === 0 ? (
            <EmptyState
              title={todas.length === 0 ? 'Sin actividades' : 'Nada con estos filtros'}
              message={
                todas.length > 0
                  ? 'Prueba con otra pestaña o borra la búsqueda.'
                  : puedeEscribir
                    ? 'Crea la primera para que el servidor avise de su vencimiento.'
                    : 'Todavía no hay actividades registradas.'
              }
            />
          ) : null}

          {grupos.map((grupo) => (
            <section key={grupo.tramo} className="flex flex-col gap-2" aria-label={grupo.titulo}>
              <h2 className="flex items-center gap-2 text-body font-semibold text-text">
                {grupo.titulo}
                <span className="text-caption font-normal text-muted tabular">{grupo.items.length}</span>
              </h2>
              <AnimatePresence initial={false} mode="popLayout">
                {grupo.items.map((actividad) => (
                  <motion.div
                    key={actividad._id}
                    layout={!sinMovimiento}
                    initial={sinMovimiento ? false : { opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={sinMovimiento ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, scale: 0.98 }}
                    transition={{ duration: 0.18, ease: 'easeOut' }}
                  >
                    <ActivityCard
                      actividad={actividad}
                      materia={materiaDe(actividad.subjectId)}
                      offset={offset}
                      ahora={ahora}
                      resaltada={destacada === actividad._id}
                      puedeEscribir={puedeEscribir}
                      puedeReabrir={puedeReabrir}
                      onEditar={() => setFormulario({ actividad, clave: Date.now() })}
                      onCambiarEstado={(abrir) => cambiarEstado.mutate({ id: actividad._id, abrir })}
                      onBorrar={() => setBorrando(actividad)}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </section>
          ))}
        </div>

        <div className="@4xl:sticky @4xl:top-4">
          <CalendarioActividades
            actividades={todas}
            subjectId={subjectId}
            offset={offset}
            ahora={ahora}
            nombreDeMateria={materiaDe}
            onElegirActividad={enfocar}
          />
        </div>
      </div>

      {formulario ? (
        <ActivityFormDialog
          key={formulario.clave}
          open
          onOpenChange={(abierto) => (abierto ? null : setFormulario(null))}
          actividad={formulario.actividad}
          materias={materias.data ?? []}
          inicial={{ subjectId, period }}
          onGuardada={invalidar}
        />
      ) : null}

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
