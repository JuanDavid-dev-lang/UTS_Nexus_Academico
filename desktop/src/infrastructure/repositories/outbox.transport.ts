import { request } from '@/core/api/http-client';
import type { OutboxEntry } from '@/domain/offline/outbox';

/**
 * Sube UNA entrada de la cola tal como se guardó.
 *
 * Sin esquema de respuesta a propósito: lo que importa es que el servidor la
 * aceptó. Si una respuesta con otra forma tumbara el envío, una nota ya
 * escrita se reintentaría —sin daño, el servidor escribe por clave natural—
 * pero se mostraría como fallo algo que salió bien.
 */
export async function enviarEntrada(entrada: OutboxEntry): Promise<void> {
  await request(entrada.path, {
    method: entrada.method,
    ...(entrada.body ? { body: entrada.body } : {}),
  });
}
