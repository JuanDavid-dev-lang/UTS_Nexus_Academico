import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/core/api/query-keys';
import { studentRepository } from '@/infrastructure/repositories/academic.repository';
import type { StudentInput } from '@/domain/schemas/academic';
import { toast } from '@/state/toast.store';

export function useStudents() {
  return useQuery({
    queryKey: queryKeys.students.list(),
    queryFn: () => studentRepository.list(),
  });
}

export function useCreateStudent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: StudentInput) => studentRepository.create(input),
    onSuccess(student) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.students.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.analytics.all });
      toast.success('Estudiante creado', student.fullName);
    },
    onError(error) {
      toast.fromError(error, 'No se pudo crear el estudiante');
    },
  });
}

export function useUpdateStudent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<StudentInput> }) =>
      studentRepository.update(id, input),
    onSuccess(student) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.students.all });
      toast.success('Estudiante actualizado', student.fullName);
    },
    onError(error) {
      toast.fromError(error, 'No se pudo actualizar el estudiante');
    },
  });
}

export function useDeleteStudent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => studentRepository.remove(id),
    onSuccess() {
      void queryClient.invalidateQueries({ queryKey: queryKeys.students.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.analytics.all });
      toast.success('Estudiante eliminado');
    },
    onError(error) {
      toast.fromError(error, 'No se pudo eliminar el estudiante');
    },
  });
}
