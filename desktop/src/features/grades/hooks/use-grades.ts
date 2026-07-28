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

    const enrolledIds = new Set(enrollments.data.map((enrollment) => enrollment.studentId));
    const matched = students.data.filter((student) => enrolledIds.has(student._id));

    // Some installations capture grades without a formal enrollment record.
    // Falling back to the full scoped list keeps those teachers unblocked.
    return matched.length > 0 ? matched : students.data;
  }, [enrollments.data, students.data]);

  return {
    data,
    isPending: enrollments.isPending || students.isPending,
    isError: enrollments.isError || students.isError,
    error: enrollments.error ?? students.error,
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
