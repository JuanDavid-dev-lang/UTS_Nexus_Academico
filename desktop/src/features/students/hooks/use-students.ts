import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/core/api/query-keys';
import { studentRepository } from '@/infrastructure/repositories/academic.repository';
import type { StudentInput } from '@/domain/schemas/academic';
import type { Scope } from '@/domain/repositories/ports';
import { toast } from '@/state/toast.store';

/**
 * Listado de estudiantes.
 *
 * Con `scope.subjectId` devuelve solo la lista de esa asignatura. Sin ámbito,
 * todos los del docente — que es lo correcto en la pantalla de Estudiantes,
 * pero no en la de una materia concreta.
 */
export function useStudents(scope?: Scope & { q?: string }) {
  return useQuery({
    queryKey: queryKeys.students.list(scope),
    queryFn: () => studentRepository.list(scope),
  });
}

/**
 * Búsqueda en el directorio global, para matricular gente que aún no es tuya.
 *
 * Se mantiene el resultado anterior mientras llega el nuevo para que la lista no
 * parpadee a vacío en cada tecla.
 */
export function useStudentSearch(term: string) {
  const trimmed = term.trim();

  return useQuery({
    queryKey: queryKeys.students.search(trimmed),
    queryFn: () => studentRepository.search(trimmed),
    enabled: trimmed.length >= 3,
    placeholderData: (previous) => previous,
    staleTime: 30_000,
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
