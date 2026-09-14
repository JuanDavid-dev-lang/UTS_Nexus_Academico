import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/core/api/query-keys';
import { attendanceQrRepository } from '@/infrastructure/repositories/attendance-qr.repository';
import type { SesionQr } from '@/domain/schemas/attendance-qr';
import { toast } from '@/state/toast.store';

/**
 * La sesión abierta de una materia, si la hay.
 *
 * Es lo que permite cerrar el diálogo del QR —o recargar la ventana— sin perder
 * la clase: la sesión sigue recibiendo marcas en el servidor y el botón la
 * retoma.
 */
/**
 * La lista por QR abierta de una materia: la del grupo que se está mirando si
 * la hay, o cualquiera de la materia (para retomarla aunque se haya cambiado de
 * grupo en la pantalla).
 */
export function useSesionQrAbierta(subjectId: string, groupId: string, enabled: boolean) {
  const abiertas = useQuery({
    queryKey: queryKeys.attendanceQr.abiertas(subjectId),
    queryFn: () => attendanceQrRepository.abiertas(subjectId),
    enabled: enabled && Boolean(subjectId),
  });
  const items = abiertas.data ?? [];
  const data = (groupId ? items.find((s) => s.groupId === groupId) : undefined) ?? items[0] ?? null;
  return { ...abiertas, data };
}

/**
 * Quién va marcando.
 *
 * Se refresca por socket con cada marca (`attendanceSession`). El intervalo es
 * solo la red de seguridad para un socket caído, y se apaga al cerrar la
 * sesión: una lista cerrada ya no cambia.
 */
export function useSesionQr(id: string | null) {
  return useQuery({
    queryKey: queryKeys.attendanceQr.sesion(id ?? ''),
    queryFn: () => attendanceQrRepository.sesion(id as string),
    enabled: Boolean(id),
    staleTime: 0,
    refetchInterval: (query) => (query.state.data?.estado === 'ABIERTA' ? 10_000 : false),
    refetchIntervalInBackground: true,
  });
}

/**
 * El QR vigente, pedido de nuevo justo cuando cambia.
 *
 * El intervalo lo dicta el servidor (`refrescarEnMs`) en vez de contarlo aquí:
 * con el reloj del equipo del aula adelantado o atrasado, la pantalla enseñaría
 * un código ya vencido. `InBackground` porque la ventana del proyector casi
 * nunca tiene el foco.
 */
export function useQrVigente(id: string | null, activo: boolean) {
  return useQuery({
    queryKey: queryKeys.attendanceQrCode.de(id ?? ''),
    queryFn: () => attendanceQrRepository.qr(id as string),
    enabled: Boolean(id) && activo,
    staleTime: 0,
    gcTime: 0,
    retry: 1,
    refetchInterval: (query) => {
      const ms = query.state.data?.refrescarEnMs;
      // Un margen pequeño: pedirlo en el milisegundo exacto del cambio puede
      // devolver todavía el anterior.
      return typeof ms === 'number' ? Math.max(300, ms + 150) : 2_000;
    },
    refetchIntervalInBackground: true,
  });
}

export function useAbrirSesionQr() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof attendanceQrRepository.abrir>[0]) =>
      attendanceQrRepository.abrir(input),
    onSuccess({ sesion }) {
      queryClient.setQueryData(queryKeys.attendanceQr.sesion(sesion.id), sesion);
      void queryClient.invalidateQueries({ queryKey: queryKeys.attendanceQr.abiertas(sesion.subjectId) });
    },
    onError(error) {
      toast.fromError(error, 'No se pudo abrir la lista por QR');
    },
  });
}

export function useCerrarSesionQr() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => attendanceQrRepository.cerrar(id),
    onSuccess(sesion: SesionQr) {
      queryClient.setQueryData(queryKeys.attendanceQr.sesion(sesion.id), sesion);
      void queryClient.invalidateQueries({ queryKey: queryKeys.attendanceQr.abiertas(sesion.subjectId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.attendance.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.analytics.all });
    },
    onError(error) {
      toast.fromError(error, 'No se pudo cerrar la lista');
    },
  });
}
