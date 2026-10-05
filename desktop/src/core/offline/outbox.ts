/**
 * La cola de envíos de la aplicación: el servicio con sus dependencias reales.
 *
 * Dónde se guarda: en el disco del equipo (IndexedDB) en la aplicación de
 * escritorio, y solo en memoria en la versión web. La web no deja datos tras
 * cerrar la pestaña (ver `core/offline/cache.ts`), así que allí la cola
 * aguanta cortes de red, no cerrar el navegador — y el diálogo de cerrar
 * sesión lo dice.
 */
import { isExpiring, tokenService } from '@/core/auth/token.service';
import { refreshAccessToken } from '@/core/api/http-client';
import { queryKeys } from '@/core/api/query-keys';
import { esWeb } from '@/core/platform/tauri';
import { crearAlmacenDeCola } from '@/infrastructure/offline/almacenes';
import { almacenLocal, crearAlmacenMemoria } from '@/infrastructure/offline/kv';
import { enviarEntrada } from '@/infrastructure/repositories/outbox.transport';
import { useConectividad } from '@/state/connectivity.store';
import { useOutbox } from '@/state/outbox.store';
import { toast } from '@/state/toast.store';
import { clienteRegistrado } from './cache';
import { marcarSinConexion } from './conectividad';
import { crearServicioDeOutbox } from './outbox.service';
import { programarPrecarga } from './precarga';

useOutbox.setState({ persiste: !esWeb });

export const outbox = crearServicioDeOutbox({
  almacen: crearAlmacenDeCola(esWeb ? crearAlmacenMemoria() : almacenLocal()),
  enviar: enviarEntrada,
  enLinea: () => useConectividad.getState().online,
  ahora: () => Date.now(),
  nuevoId: () => crypto.randomUUID(),

  // Una sola renovación antes de la tanda, por el mismo camino de una sola vez
  // que usa el cliente HTTP: diez entradas con el token vencido no hacen diez
  // renovaciones. Si no se pudo, la primera petición lo vuelve a intentar y
  // decide si la sesión murió.
  async antesDeEnviar() {
    const acceso = tokenService.getAccessToken();
    if (acceso && isExpiring(acceso)) await refreshAccessToken();
  },

  async alTerminar() {
    const cliente = clienteRegistrado();
    if (!cliente) return;
    await Promise.all([
      cliente.invalidateQueries({ queryKey: queryKeys.grades.all }),
      cliente.invalidateQueries({ queryKey: queryKeys.attendance.all }),
      cliente.invalidateQueries({ queryKey: queryKeys.analytics.all }),
    ]);
    // Tras una subida el servidor responde, así que es buen momento para completar la precarga.
    programarPrecarga();
  },

  alFallarLaRed: marcarSinConexion,
  avisar: { exito: toast.success, error: toast.error },
});
