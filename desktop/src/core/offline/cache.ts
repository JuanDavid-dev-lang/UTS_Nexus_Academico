/**
 * Caché de consultas en disco y último usuario.
 *
 * **Dónde NO se guarda nada**: en la versión web (`esWeb`) y cuando la sesión
 * se inició sin «Mantener la sesión iniciada». En la web la sesión vive en
 * `sessionStorage` y termina al cerrar la pestaña; dejar los estudiantes y sus
 * notas en IndexedDB —que sobrevive a la pestaña— rompería esa promesa. Sin la
 * casilla, la persona dijo que el equipo es compartido: lo mismo. En ambos
 * casos el modo sin conexión funciona mientras la ventana siga abierta (la
 * caché en memoria ya sirve), pero no sobrevive a cerrarla.
 *
 * Los datos van en claro en el almacén de la aplicación (los tokens, en el
 * llavero del sistema). Por eso solo se guardan las consultas de
 * `domain/offline/persistencia.ts`, caducan a los 7 días y se borran al cerrar
 * o perder la sesión.
 */
import type { QueryClient } from '@tanstack/react-query';
import {
  persistQueryClientRestore,
  persistQueryClientSubscribe,
} from '@tanstack/query-persist-client-core';
import { tokenService } from '@/core/auth/token.service';
import { esWeb } from '@/core/platform/tauri';
import { version as APP_VERSION } from '../../../package.json';
import {
  VIDA_MAXIMA_CACHE_MS,
  debePersistir,
  selloDeCache,
} from '@/domain/offline/persistencia';
import {
  crearAlmacenDeUsuario,
  crearPersisterDeCache,
  type PersisterDeCache,
} from '@/infrastructure/offline/almacenes';
import { almacenLocal } from '@/infrastructure/offline/kv';
import type { User } from '@/domain/schemas/auth';

const usuarioGuardado = () => crearAlmacenDeUsuario(almacenLocal());

/** ¿Esta sesión puede dejar datos en el disco del equipo? */
export function puedePersistir(): boolean {
  return !esWeb && tokenService.seGuarda();
}

let cliente: QueryClient | null = null;

/** El `QueryClient` de la aplicación, para quien debe restaurar antes de que exista React. */
export function registrarCliente(queryClient: QueryClient): void {
  cliente = queryClient;
}

export function clienteRegistrado(): QueryClient | null {
  return cliente;
}

const persisters = new Map<string, PersisterDeCache>();

function persisterDe(userId: string): PersisterDeCache {
  let persister = persisters.get(userId);
  if (!persister) {
    persister = crearPersisterDeCache(almacenLocal(), userId);
    persisters.set(userId, persister);
  }
  return persister;
}

/** Vuelca al `QueryClient` lo guardado de este usuario. Nunca lanza: sin caché, se parte de cero. */
export async function restaurarCache(userId: string): Promise<void> {
  if (!cliente || !puedePersistir()) return;
  try {
    await persistQueryClientRestore({
      queryClient: cliente,
      persister: persisterDe(userId),
      maxAge: VIDA_MAXIMA_CACHE_MS,
      buster: selloDeCache(APP_VERSION),
    });
  } catch {
    // Una caché ilegible se ignora.
  }
}

/** Empieza a guardar los cambios de la caché. Devuelve la función que lo detiene. */
export function iniciarPersistencia(userId: string): () => void {
  if (!cliente || !puedePersistir()) return () => undefined;
  return persistQueryClientSubscribe({
    queryClient: cliente,
    persister: persisterDe(userId),
    buster: selloDeCache(APP_VERSION),
    dehydrateOptions: {
      // Solo lo que cargó bien y es de los que se guardan: un error o una carga
      // a medias hidratados como si fueran datos darían pantallas vacías.
      shouldDehydrateQuery: (query) =>
        query.state.status === 'success' && debePersistir(query.queryKey),
    },
  });
}

/** Borra la caché de este usuario. NO toca su cola de envíos. */
export async function borrarCache(userId: string | null | undefined): Promise<void> {
  if (!userId) return;
  const persister = persisterDe(userId);
  persister.detener();
  persisters.delete(userId);
  try {
    await persister.removeClient();
  } catch {
    // Nada que borrar.
  }
}

export async function guardarUltimoUsuario(user: User): Promise<void> {
  if (!puedePersistir()) return;
  try {
    await usuarioGuardado().guardar(user);
  } catch {
    // Sin almacén, la próxima vez habrá que tener servidor.
  }
}

export async function leerUltimoUsuario(): Promise<User | null> {
  if (esWeb) return null;
  try {
    return await usuarioGuardado().leer();
  } catch {
    return null;
  }
}

export async function borrarUltimoUsuario(): Promise<void> {
  try {
    await usuarioGuardado().borrar();
  } catch {
    // Nada que borrar.
  }
}
