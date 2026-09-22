import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/core/api/query-keys';
import { gradeTemplateRepository } from '@/infrastructure/repositories/grade-templates.repository';
import type { EstructuraNotasInput, PlantillaNotasInput } from '@/domain/schemas/grades';
import { toast } from '@/state/toast.store';

/** Las plantillas del docente: se cargan una vez y cambian poco. */
export function useGradeTemplates(enabled = true) {
  return useQuery({
    queryKey: queryKeys.gradeTemplates.list(),
    queryFn: () => gradeTemplateRepository.list(),
    enabled,
    staleTime: 60_000,
  });
}

/** La estructura vigente para la materia (y grupo) que se está calificando. */
export function useCurrentStructure(input: { period: string; subjectId?: string; groupId?: string }) {
  return useQuery({
    queryKey: queryKeys.gradeTemplates.current(input.period, input.subjectId ?? '', input.groupId ?? ''),
    queryFn: () =>
      gradeTemplateRepository.current({
        period: input.period,
        subjectId: input.subjectId as string,
        ...(input.groupId ? { groupId: input.groupId } : {}),
      }),
    enabled: Boolean(input.period && input.subjectId),
    staleTime: 60_000,
  });
}

export function useStructures(period: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.gradeTemplates.structures(period),
    queryFn: () => gradeTemplateRepository.structures(period),
    enabled: enabled && Boolean(period),
    staleTime: 60_000,
  });
}

function useInvalidarPlantillas() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.gradeTemplates.all });
  };
}

export function useSaveTemplate() {
  const invalidar = useInvalidarPlantillas();
  return useMutation({
    mutationFn: (input: { id?: string; datos: PlantillaNotasInput }) =>
      input.id ? gradeTemplateRepository.update(input.id, input.datos) : gradeTemplateRepository.create(input.datos),
    onSuccess(_, input) {
      invalidar();
      toast.success(input.id ? 'Plantilla actualizada' : 'Plantilla creada');
    },
    onError(error) {
      toast.fromError(error, 'No se pudo guardar la plantilla');
    },
  });
}

export function useDeleteTemplate() {
  const invalidar = useInvalidarPlantillas();
  return useMutation({
    mutationFn: (id: string) => gradeTemplateRepository.remove(id),
    onSuccess() {
      invalidar();
      toast.success('Plantilla eliminada');
    },
    onError(error) {
      toast.fromError(error, 'No se pudo eliminar la plantilla');
    },
  });
}

/**
 * Aplicar una plantilla cambia con qué peso se guardan las notas que vengan:
 * invalida también el consolidado, porque el desglose ofrece lo que falta
 * según la estructura.
 */
export function useApplyStructure() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: EstructuraNotasInput) => gradeTemplateRepository.apply(input),
    onSuccess() {
      void queryClient.invalidateQueries({ queryKey: queryKeys.gradeTemplates.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.grades.all });
      toast.success('Plantilla aplicada', 'Las notas nuevas de ese grupo tomarán estos pesos.');
    },
    onError(error) {
      toast.fromError(error, 'No se pudo aplicar la plantilla');
    },
  });
}

export function useRemoveStructure() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => gradeTemplateRepository.removeStructure(id),
    onSuccess() {
      void queryClient.invalidateQueries({ queryKey: queryKeys.gradeTemplates.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.grades.all });
      toast.success('Plantilla retirada del grupo');
    },
    onError(error) {
      toast.fromError(error, 'No se pudo retirar la plantilla');
    },
  });
}
