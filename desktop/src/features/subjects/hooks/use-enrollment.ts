import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/core/api/query-keys';
import { enrollmentRepository } from '@/infrastructure/repositories/academic.repository';
import type { RosterRow } from '@/domain/schemas/academic';
import { toast } from '@/state/toast.store';

/**
 * Invalida todo lo que cambia al mover una matrícula.
 *
 * Matricular no solo altera la lista: el tablero, el riesgo y los reportes se
 * calculan sobre la matrícula, así que dejar sus cachés vivas mostraría cifras
 * de antes del cambio.
 */
function useEnrollmentInvalidation() {
  const queryClient = useQueryClient();

  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.enrollments.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.students.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.analytics.all });
  };
}

export function useEnrollStudent() {
  const invalidate = useEnrollmentInvalidation();

  return useMutation({
    mutationFn: (input: { studentId: string; groupId: string }) =>
      enrollmentRepository.enroll(input),
    onSuccess() {
      invalidate();
      toast.success('Estudiante matriculado');
    },
    onError(error) {
      toast.fromError(error, 'No se pudo matricular al estudiante');
    },
  });
}

export function useImportRoster() {
  const invalidate = useEnrollmentInvalidation();

  return useMutation({
    mutationFn: (input: { groupId: string; students: RosterRow[] }) =>
      enrollmentRepository.importRoster(input),
    onSuccess(count) {
      invalidate();
      toast.success(
        'Lista importada',
        `${count} ${count === 1 ? 'estudiante matriculado' : 'estudiantes matriculados'}`,
      );
    },
    onError(error) {
      toast.fromError(error, 'No se pudo importar la lista');
    },
  });
}

export function useWithdrawEnrollment() {
  const invalidate = useEnrollmentInvalidation();

  return useMutation({
    mutationFn: (id: string) => enrollmentRepository.remove(id),
    onSuccess() {
      invalidate();
      toast.success('Matrícula retirada');
    },
    onError(error) {
      toast.fromError(error, 'No se pudo retirar la matrícula');
    },
  });
}
