import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/core/api/query-keys';
import { agendaRepository } from '@/infrastructure/repositories/agenda.repository';
import type { AgendaTipo, CalendarEventInput } from '@/domain/schemas/agenda';
import { OFFSET_CAMPUS_POR_DEFECTO, rangoDeVista, type VistaAgenda } from '@/domain/agenda/calendar';
import { useSession } from '@/state/session.store';
import { toast } from '@/state/toast.store';

/**
 * Reloj compartido de la agenda.
 *
 * El contador de "comienza en 32 minutos" no puede depender de refrescar la
 * consulta: haría una petición por minuto solo para restar. Aquí se vuelve a
 * dibujar con el reloj local y la respuesta del servidor se refresca mucho más
 * despacio; lo que cuenta —a qué hora es la clase— sigue viniendo del servidor.
 */
export function useAhora(intervaloMs = 30_000): Date {
  const [ahora, setAhora] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setAhora(new Date()), intervaloMs);
    return () => clearInterval(id);
  }, [intervaloMs]);

  return ahora;
}

/** Minutos que faltan hasta un instante, redondeando hacia arriba. */
export function minutosHasta(iso: string, ahora: Date): number {
  return Math.ceil((new Date(iso).getTime() - ahora.getTime()) / 60_000);
}

export function useAgendaRange(
  vista: VistaAgenda,
  ancla: Date,
  filtros: { subjectId?: string; tipos?: AgendaTipo[] } = {},
) {
  const autenticado = useSession((estado) => estado.status === 'authenticated');

  // El rango se calcula con el desfase por defecto y el servidor devuelve el
  // suyo: la diferencia son horas, nunca días, así que el rango pedido cubre de
  // sobra la vista aunque el campus cambiara de zona.
  const { desde, hasta } = useMemo(
    () => rangoDeVista(vista, ancla, OFFSET_CAMPUS_POR_DEFECTO),
    [vista, ancla],
  );

  return useQuery({
    queryKey: queryKeys.agenda.range(desde.toISOString(), hasta.toISOString(), filtros.subjectId),
    queryFn: () =>
      agendaRepository.range({
        desde,
        hasta,
        ...(filtros.subjectId ? { subjectId: filtros.subjectId } : {}),
        ...(filtros.tipos?.length ? { tipos: filtros.tipos } : {}),
      }),
    enabled: autenticado,
    staleTime: 60_000,
    // Al cambiar de semana se conserva lo anterior mientras llega lo nuevo: sin
    // esto la rejilla parpadea en blanco en cada flecha.
    placeholderData: (anterior) => anterior,
  });
}

/**
 * Resumen para la tarjeta de próxima clase.
 *
 * Se refresca cada cinco minutos porque lo que cambia es qué clase es la
 * siguiente, no cuántos minutos faltan —eso lo cuenta el reloj local—. Y se
 * invalida en cuanto llega un `sync:update` de horario o calendario.
 */
export function useAgendaResumen() {
  const autenticado = useSession((estado) => estado.status === 'authenticated');

  return useQuery({
    queryKey: queryKeys.agenda.summary(),
    queryFn: () => agendaRepository.summary(),
    enabled: autenticado,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: true,
  });
}

function invalidarAgenda(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.agenda.all });
}

export function useCreateEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CalendarEventInput) => agendaRepository.createEvent(input),
    onSuccess(evento) {
      invalidarAgenda(queryClient);
      toast.success('Evento creado', evento.title);
    },
    onError(error) {
      toast.fromError(error, 'No se pudo crear el evento');
    },
  });
}

export function useUpdateEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { id: string; cambios: Partial<CalendarEventInput> }) =>
      agendaRepository.updateEvent(input.id, input.cambios),
    onSuccess() {
      invalidarAgenda(queryClient);
      toast.success('Evento actualizado');
    },
    onError(error) {
      toast.fromError(error, 'No se pudo actualizar el evento');
    },
  });
}

export function useDeleteEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => agendaRepository.removeEvent(id),
    onSuccess() {
      invalidarAgenda(queryClient);
      toast.success('Evento eliminado');
    },
    onError(error) {
      toast.fromError(error, 'No se pudo eliminar el evento');
    },
  });
}
