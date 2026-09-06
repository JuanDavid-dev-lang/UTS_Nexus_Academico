import { useMutation, useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/core/api/query-keys';
import { uniplannerRepository } from '@/infrastructure/repositories/uniplanner.repository';
import { MOTIVOS, type EnvioUniPlanner } from '@/domain/schemas/uniplanner';
import { toast } from '@/state/toast.store';

/**
 * Si el puente está encendido en este servidor.
 *
 * Se consulta una vez y se queda: depende del despliegue, no de los datos. Sin
 * credenciales configuradas la respuesta es `configurado: false` y la lista de
 * clase no pinta ni insignias ni botón — enseñar un botón que no puede
 * funcionar es peor que no enseñarlo.
 */
export function useEstadoUniPlanner() {
  return useQuery({
    queryKey: queryKeys.uniplanner.estado(),
    queryFn: () => uniplannerRepository.estado(),
    staleTime: 10 * 60 * 1000,
    // Un puente apagado no es un error que haya que reintentar tres veces en
    // cada pantalla.
    retry: false,
  });
}

/** Qué estudiantes de la materia tienen la app enlazada. */
export function useEnlacesUniPlanner(
  filtro: { subjectId: string; period?: string },
  enabled: boolean,
) {
  return useQuery({
    queryKey: queryKeys.uniplanner.enlaces(filtro),
    queryFn: () => uniplannerRepository.enlaces(filtro),
    enabled: enabled && Boolean(filtro.subjectId),
    // La vinculación cambia cuando un estudiante entra en su app, no mientras
    // se pasa lista.
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * El resumen de un envío, contado por el servidor.
 *
 * Se enseña también lo que **no** salió y por qué. «Avisé a treinta» cuando
 * veintiocho no tienen la app es una frase que nadie puede comprobar y que
 * lleva a dar por hecho que el mensaje llegó.
 */
function anunciar(envio: EnvioUniPlanner): void {
  if (envio.enviados === 0) {
    const primero = envio.resultados.find((r) => !r.enviado)?.motivo;
    toast.warning(
      'No se envió ningún aviso',
      primero ? MOTIVOS[primero] : 'Ninguno de los seleccionados tiene UniPlanner enlazado.',
    );
    return;
  }

  const cuerpo =
    envio.omitidos > 0
      ? `${envio.omitidos} de ${envio.total} no lo recibieron: revisa el detalle.`
      : undefined;
  toast.success(
    envio.enviados === 1 ? 'Aviso enviado' : `${envio.enviados} avisos enviados`,
    cuerpo,
  );
}

export function useAvisarInasistencia() {
  return useMutation({
    mutationFn: (input: Parameters<typeof uniplannerRepository.avisarInasistencia>[0]) =>
      uniplannerRepository.avisarInasistencia(input),
    onSuccess: anunciar,
    onError(error) {
      toast.fromError(error, 'No se pudo enviar el aviso a UniPlanner');
    },
  });
}

export function useAvisarNota() {
  return useMutation({
    mutationFn: (input: Parameters<typeof uniplannerRepository.avisarNota>[0]) =>
      uniplannerRepository.avisarNota(input),
    onSuccess: anunciar,
    onError(error) {
      toast.fromError(error, 'No se pudo enviar la nota a UniPlanner');
    },
  });
}

export function useAvisarEntrega() {
  return useMutation({
    mutationFn: (input: Parameters<typeof uniplannerRepository.avisarEntrega>[0]) =>
      uniplannerRepository.avisarEntrega(input),
    onSuccess: anunciar,
    onError(error) {
      toast.fromError(error, 'No se pudo enviar la entrega a UniPlanner');
    },
  });
}
