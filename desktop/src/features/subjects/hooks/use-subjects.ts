import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/core/api/query-keys';
import { groupRepository, subjectRepository } from '@/infrastructure/repositories/academic.repository';
import type { SubjectInput } from '@/domain/schemas/academic';
import { toast } from '@/state/toast.store';

export function useSubjects() {
  return useQuery({
    queryKey: queryKeys.subjects.list(),
    queryFn: () => subjectRepository.list(),
  });
}

export function useGroups() {
  return useQuery({
    queryKey: queryKeys.groups.list(),
    queryFn: () => groupRepository.list(),
    staleTime: 5 * 60_000,
  });
}

export function useCreateSubject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: SubjectInput & { professorId: string }) => subjectRepository.create(input),
    onSuccess(subject) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.subjects.all });
      toast.success('Materia creada', subject.name);
    },
    onError(error) {
      toast.fromError(error, 'No se pudo crear la materia');
    },
  });
}

export function useUpdateSubject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<SubjectInput> }) =>
      subjectRepository.update(id, input),
    onSuccess(subject) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.subjects.all });
      toast.success('Materia actualizada', subject.name);
    },
    onError(error) {
      toast.fromError(error, 'No se pudo actualizar la materia');
    },
  });
}

export function useDeleteSubject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => subjectRepository.remove(id),
    onSuccess() {
      void queryClient.invalidateQueries({ queryKey: queryKeys.subjects.all });
      toast.success('Materia eliminada');
    },
    onError(error) {
      toast.fromError(error, 'No se pudo eliminar la materia');
    },
  });
}
