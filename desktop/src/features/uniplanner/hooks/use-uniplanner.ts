import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/core/api/query-keys';
import { uniplannerRepository } from '@/infrastructure/repositories/uniplanner.repository';
import {
  MOTIVOS,
  type AccionSolicitud,
  type AccionVinculo,
  type EnvioUniPlanner,
  type FiltroVinculos,
} from '@/domain/schemas/uniplanner';
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

// ── Vínculos (gestión institucional) ────────────────────────────────────────

/** Las universidades que quien consulta puede gestionar. */
export function useInstitucionesGestionables(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.uniplanner.instituciones(),
    queryFn: () => uniplannerRepository.institucionesGestionables(),
    enabled,
    staleTime: 10 * 60 * 1000,
  });
}

/** Los enlaces de una universidad, o la búsqueda de un estudiante, por páginas. */
export function useVinculos(filtro: {
  institucion: string;
  filtro: FiltroVinculos;
  q: string;
}) {
  return useInfiniteQuery({
    queryKey: queryKeys.uniplanner.vinculos(filtro),
    queryFn: ({ pageParam }) =>
      uniplannerRepository.vinculos({ ...filtro, despuesDe: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: (pagina) => pagina.siguiente,
    enabled: Boolean(filtro.institucion),
  });
}

export function useSolicitudesDeEnlace(institucion: string) {
  return useQuery({
    queryKey: queryKeys.uniplanner.solicitudes(institucion),
    queryFn: () => uniplannerRepository.solicitudes(institucion),
    enabled: Boolean(institucion),
    // Las solicitudes llegan de Firestore, no por `sync:update`: con la
    // pantalla abierta se repasan cada minuto, que es de sobra para algo que el
    // estudiante manda una vez y el servidor avisa cada cinco.
    refetchInterval: 60_000,
  });
}

const MENSAJE_ACCION: Record<AccionVinculo | AccionSolicitud, string> = {
  verificar: 'Enlace verificado',
  desverificar: 'Verificación retirada',
  desbloquear: 'Bloqueo quitado: el estudiante ya puede cambiar su enlace',
  liberar: 'Documento liberado: ya se puede enlazar con él',
  asignar: 'Documento asignado a quien lo pidió, ya verificado',
  rechazar: 'Solicitud rechazada',
};

export function useAccionVinculo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ linkId, accion }: { linkId: string; accion: AccionVinculo }) =>
      uniplannerRepository.accionVinculo(linkId, accion),
    onSuccess(_vinculo, { accion }) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.uniplanner.all });
      toast.success(MENSAJE_ACCION[accion]);
    },
    onError(error) {
      toast.fromError(error, 'No se pudo cambiar el enlace');
    },
  });
}

export function useResolverSolicitud() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ uid, accion, nota }: { uid: string; accion: AccionSolicitud; nota?: string }) =>
      uniplannerRepository.resolverSolicitud(uid, accion, nota),
    onSuccess(_r, { accion }) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.uniplanner.all });
      toast.success(MENSAJE_ACCION[accion], 'El estudiante lo verá en su app.');
    },
    onError(error) {
      toast.fromError(error, 'No se pudo resolver la solicitud');
    },
  });
}
