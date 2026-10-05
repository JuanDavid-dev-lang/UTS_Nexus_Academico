/**
 * Almacén clave-valor local del modo sin conexión.
 *
 * IndexedDB (vía `idb-keyval`) y no `localStorage`: la caché de consultas pesa
 * megabytes, `localStorage` es síncrono y tiene un tope de ~5 MB, y se
 * bloquearía el hilo de la interfaz en cada escritura. Si IndexedDB no existe
 * (pruebas, un WebView sin él) cae a memoria: el modo sin conexión degrada a
 * «dura lo que la ventana», no falla.
 */
import { createStore, del, get, set, type UseStore } from 'idb-keyval';

export interface AlmacenKv {
  get<T>(clave: string): Promise<T | undefined>;
  set(clave: string, valor: unknown): Promise<void>;
  del(clave: string): Promise<void>;
}

export function crearAlmacenMemoria(): AlmacenKv {
  const datos = new Map<string, unknown>();
  return {
    async get<T>(clave: string) {
      return datos.get(clave) as T | undefined;
    },
    async set(clave, valor) {
      datos.set(clave, valor);
    },
    async del(clave) {
      datos.delete(clave);
    },
  };
}

function crearAlmacenIdb(): AlmacenKv {
  const tienda: UseStore = createStore('uts-nexus-sin-conexion', 'kv');
  return {
    get: <T>(clave: string) => get<T>(clave, tienda),
    set: (clave, valor) => set(clave, valor, tienda),
    del: (clave) => del(clave, tienda),
  };
}

export function crearAlmacenPorDefecto(): AlmacenKv {
  return typeof indexedDB === 'undefined' ? crearAlmacenMemoria() : crearAlmacenIdb();
}

let compartido: AlmacenKv | null = null;

/** El almacén del disco, creado la primera vez que se necesita. */
export function almacenLocal(): AlmacenKv {
  compartido ??= crearAlmacenPorDefecto();
  return compartido;
}
