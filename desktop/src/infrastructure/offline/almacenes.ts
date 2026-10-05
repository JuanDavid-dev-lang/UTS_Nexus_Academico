/**
 * Lo que el modo sin conexión guarda, y dónde.
 *
 * Tres cosas con vidas distintas, y por eso con claves distintas:
 *  - la **cola de envíos**, por usuario: nunca se borra por cerrar sesión ni
 *    por caducar la sesión — son notas que el docente escribió y aún no subió;
 *  - la **caché de consultas**, por usuario: se borra al cerrar o perder la
 *    sesión y caduca a los siete días;
 *  - el **último usuario**: lo que permite abrir sin servidor. Se borra con la
 *    caché, porque sin ella no hay nada que enseñar.
 */
import type { PersistedClient, Persister } from '@tanstack/query-persist-client-core';
import { userSchema, type User } from '@/domain/schemas/auth';
import { leerCola } from '@/domain/offline/outbox-schema';
import type { OutboxEntry } from '@/domain/offline/outbox';
import type { AlmacenKv } from './kv';

const claveCola = (userId: string) => `cola:${userId}`;
const claveCache = (userId: string) => `cache:${userId}`;
const CLAVE_ULTIMO_USUARIO = 'ultimo-usuario';

// ── Cola ────────────────────────────────────────────────────────────────────

export type AlmacenDeCola = {
  cargar(userId: string): Promise<{ entradas: OutboxEntry[]; descartadas: number }>;
  guardar(userId: string, entradas: OutboxEntry[]): Promise<void>;
};

export function crearAlmacenDeCola(kv: AlmacenKv): AlmacenDeCola {
  return {
    async cargar(userId) {
      return leerCola(await kv.get<unknown>(claveCola(userId)));
    },
    async guardar(userId, entradas) {
      if (entradas.length === 0) await kv.del(claveCola(userId));
      else await kv.set(claveCola(userId), entradas);
    },
  };
}

// ── Último usuario ──────────────────────────────────────────────────────────

export function crearAlmacenDeUsuario(kv: AlmacenKv) {
  return {
    async leer(): Promise<User | null> {
      const parsed = userSchema.safeParse(await kv.get<unknown>(CLAVE_ULTIMO_USUARIO));
      return parsed.success ? parsed.data : null;
    },
    async guardar(user: User): Promise<void> {
      await kv.set(CLAVE_ULTIMO_USUARIO, user);
    },
    async borrar(): Promise<void> {
      await kv.del(CLAVE_ULTIMO_USUARIO);
    },
  };
}

// ── Caché de consultas ──────────────────────────────────────────────────────

/** Espera entre escrituras a disco: la caché cambia a ráfagas y serializarla entera cuesta. */
const ESPERA_ESCRITURA_MS = 1_500;

/**
 * `Persister` de TanStack Query sobre el almacén local, para UN usuario.
 *
 * La escritura va con retardo (solo se guarda el último estado de una ráfaga).
 * `removeClient` cancela la pendiente y `detener` cierra el persister: sin eso,
 * el vaciado de la caché al cerrar sesión disparaba una escritura que volvía a
 * dejar una clave detrás.
 */
export type PersisterDeCache = Persister & {
  /** Cierra el persister: lo que llegue después no se escribe. */
  detener(): void;
};

export function crearPersisterDeCache(kv: AlmacenKv, userId: string): PersisterDeCache {
  let temporizador: ReturnType<typeof setTimeout> | null = null;
  let ultimo: PersistedClient | null = null;
  let cerrado = false;

  const volcar = async () => {
    temporizador = null;
    if (cerrado || !ultimo) return;
    const cliente = ultimo;
    ultimo = null;
    try {
      await kv.set(claveCache(userId), cliente);
    } catch {
      // Disco lleno o almacén no disponible: la caché es una comodidad, no un dato.
    }
  };

  return {
    persistClient(cliente) {
      if (cerrado) return;
      ultimo = cliente;
      temporizador ??= setTimeout(() => void volcar(), ESPERA_ESCRITURA_MS);
    },
    async restoreClient() {
      return kv.get<PersistedClient>(claveCache(userId));
    },
    async removeClient() {
      ultimo = null;
      if (temporizador) clearTimeout(temporizador);
      temporizador = null;
      await kv.del(claveCache(userId));
    },
    detener() {
      cerrado = true;
      ultimo = null;
      if (temporizador) clearTimeout(temporizador);
      temporizador = null;
    },
  };
}
