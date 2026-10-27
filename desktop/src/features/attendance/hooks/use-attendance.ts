import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/core/api/query-keys';
import { avisarGuardadoEnEquipo } from '@/core/offline/avisos';
import { outbox } from '@/core/offline/outbox';
import { attendanceRepository } from '@/infrastructure/repositories/academic.repository';
import { attendanceExcuseRepository } from '@/infrastructure/repositories/attendance.repository';
import type { MotivoExcusa } from '@/domain/schemas/attendance';
import {
  asistenciaPendiente,
  type ClaseAsistencia,
  type RegistroAsistencia,
} from '@/domain/offline/outbox';
import { useOutbox } from '@/state/outbox.store';
import type { Scope } from '@/domain/repositories/ports';
import { toast } from '@/state/toast.store';

export function useAttendance(scope: Scope, enabled = true) {
  return useQuery({
    queryKey: queryKeys.attendance.list(scope),
    queryFn: () => attendanceRepository.list(scope),
    enabled,
  });
}

/**
 * Lo marcado en una clase que aún no llegó al servidor, por estudiante.
 *
 * Incluye lo que acaba de subirse y todavía no está en la lectura fresca
 * (`recientes`), para que la marca no parpadee entre salir de la cola y llegar
 * en la lista.
 */
export function useAsistenciaPendiente(subjectId: string, dia: string) {
  const entradas = useOutbox((estado) => estado.entradas);
  const recientes = useOutbox((estado) => estado.recientes);
  return useMemo(
    () => asistenciaPendiente([...recientes, ...entradas], { subjectId, dia }),
    [entradas, recientes, subjectId, dia],
  );
}

export type MarcaDeClase = {
  clase: ClaseAsistencia;
  registros: RegistroAsistencia[];
};

/**
 * Guarda la asistencia de uno o varios estudiantes de una clase.
 *
 * Las marcas de una misma clase se funden en un solo envío (`/attendance/bulk`),
 * pasen por la cola de envíos y se suban ahora o más tarde. «Marcar todos
 * presentes» es una sola llamada, no treinta.
 */
export function useMarkAttendance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ clase, registros }: MarcaDeClase) => outbox.guardarClase(clase, registros),

    onSuccess(resultado) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.attendance.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.analytics.all });
      if (resultado.enCola) {
        avisarGuardadoEnEquipo('Asistencia guardada en este equipo');
      }
    },

    onError(error) {
      toast.fromError(error, 'No se pudo registrar la asistencia');
    },
  });
}

/**
 * Registra o retira la excusa de una falta. Con `motivo: null` la retira.
 *
 * Tira también `analytics`: una falta justificada sale del porcentaje y del
 * riesgo, y el panel tiene que reflejarlo.
 */
export function useExcusaDeFalta() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, motivo, detalle }: { id: string; motivo: MotivoExcusa | null; detalle?: string }) =>
      motivo
        ? attendanceExcuseRepository.justificar(id, { motivo, detalle: detalle ?? '' })
        : attendanceExcuseRepository.quitar(id),

    onSuccess(_item, { motivo }) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.attendance.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.analytics.all });
      toast.success(motivo ? 'Falta justificada' : 'Excusa retirada');
    },

    onError(error) {
      toast.fromError(error, 'No se pudo guardar la excusa');
    },
  });
}
