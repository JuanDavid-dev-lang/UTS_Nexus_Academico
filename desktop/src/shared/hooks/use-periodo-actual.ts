import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/core/api/query-keys';
import { periodosRepository } from '@/infrastructure/repositories/administracion.repository';
import { currentPeriod } from '@/shared/lib/format';

/**
 * El semestre que corre hoy, según el servidor.
 *
 * Lo decide `GET /periods/current` con las fechas que pone la administración;
 * `currentPeriod()` (el mes del reloj del equipo) queda solo de respaldo para
 * cuando no hay respuesta ni caché: sin servidor, abrir en el semestre del
 * calendario es mejor que no abrir. La consulta vive bajo la raíz `periods`,
 * así que la invalida el `sync:update` de `period` y se guarda en disco para
 * abrir sin conexión.
 */
export const opcionesPeriodoActual = {
  queryKey: queryKeys.periods.current(),
  queryFn: () => periodosRepository.actual(),
  // El semestre cambia dos veces al año y un cambio de fechas llega por socket.
  staleTime: 60 * 60 * 1000,
} as const;

/** El periodo vigente (`AAAA-N`), del servidor o, sin él, del calendario local. */
export function usePeriodoActual(): string {
  const consulta = useQuery(opcionesPeriodoActual);
  return consulta.data?.period ?? currentPeriod();
}

/**
 * Selector de periodo de una pantalla: arranca en el vigente y sigue al
 * servidor cuando su respuesta llega —o cambia— **mientras la persona no haya
 * elegido otro a mano**. Guardar solo la elección y derivar el resto evita el
 * efecto que copiaría la respuesta al estado y pisaría lo que ya se eligió.
 */
export function usePeriodoSeleccionado(): [string, (periodo: string) => void] {
  const vigente = usePeriodoActual();
  const [elegido, setElegido] = useState<string | null>(null);
  return [elegido ?? vigente, setElegido];
}
