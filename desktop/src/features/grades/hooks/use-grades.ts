import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/core/api/query-keys';
import {
  enrollmentRepository,
  gradeRepository,
} from '@/infrastructure/repositories/academic.repository';
import { useStudents } from '@/features/students/hooks/use-students';
import type { GradeInput } from '@/domain/schemas/academic';
import type { Scope } from '@/domain/repositories/ports';
import { toast } from '@/state/toast.store';

export function useConsolidated(scope: Scope & { period: string }, enabled = true) {
  return useQuery({
    queryKey: queryKeys.grades.consolidated(scope),
    queryFn: () => gradeRepository.consolidated(scope),
    enabled: enabled && Boolean(scope.period),
  });
}

/**
 * Lo que queda por calificar en el periodo.
 *
 * Es la pregunta de la semana de cierre —«¿qué me falta?»— y la respuesta ya
 * estaba en los datos: el motor distingue «0.0» de «sin calificar», pero esa
 * distinción solo se usaba para no dar falsos positivos de riesgo.
 */
export function usePendingGrades(period: string, subjectId?: string) {
  return useQuery({
    queryKey: queryKeys.grades.pending(period, subjectId),
    queryFn: () => gradeRepository.pending(period, subjectId),
    enabled: Boolean(period),
  });
}

export function useGrades(scope: Scope, enabled = true) {
  return useQuery({
    queryKey: queryKeys.grades.list(scope),
    queryFn: () => gradeRepository.list(scope),
    enabled,
  });
}

/**
 * Students enrolled in a subject for a period.
 *
 * Enrollments hold the relationship; the student list holds the names. Joining
 * them here keeps the two calls out of the component.
 */
export function useEnrolledStudents(scope: { subjectId?: string; period: string }) {
  const enrollments = useQuery({
    queryKey: queryKeys.enrollments.list(scope),
    queryFn: () => enrollmentRepository.list(scope),
    enabled: Boolean(scope.subjectId),
    staleTime: 60_000,
  });

  const students = useStudents();

  const data = useMemo(() => {
    if (!enrollments.data || !students.data) return [];

    // El respaldo a la lista completa existe SOLO para instalaciones legadas
    // sin ninguna matrícula formal. Antes también se activaba cuando había
    // matrículas pero ningún id casaba —que es exactamente cómo se ve un
    // contrato roto— y enmascaraba el fallo ofreciendo a todos los
    // estudiantes del docente como calificables en cualquier materia.
    if (enrollments.data.length === 0) return students.data;

    const enrolledIds = new Set(enrollments.data.map((enrollment) => enrollment.studentId));
    return students.data.filter((student) => enrolledIds.has(student._id));
  }, [enrollments.data, students.data]);

  return {
    data,
    isPending: enrollments.isPending || students.isPending,
    isError: enrollments.isError || students.isError,
    error: enrollments.error ?? students.error,
    refetch: () => {
      void enrollments.refetch();
      void students.refetch();
    },
  };
}

export function useSaveGrade() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: GradeInput) => gradeRepository.save(input),
    onSuccess() {
      // Both the raw list and the consolidated view derive from this record.
      void queryClient.invalidateQueries({ queryKey: queryKeys.grades.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.analytics.all });
      toast.success('Nota guardada');
    },
    onError(error) {
      toast.fromError(error, 'No se pudo guardar la nota');
    },
  });
}

/**
 * Borra una nota concreta de un componente.
 *
 * Quitar una nota cambia el promedio del componente y con él la del corte y la
 * final, así que invalida lo mismo que guardarla. El riesgo también: un taller
 * mal puesto puede ser justo lo que tenía a alguien marcado.
 */
export function useDeleteGrade() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => gradeRepository.remove(id),
    onSuccess() {
      void queryClient.invalidateQueries({ queryKey: queryKeys.grades.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.analytics.all });
      toast.success('Nota eliminada');
    },
    onError(error) {
      toast.fromError(error, 'No se pudo eliminar la nota');
    },
  });
}
