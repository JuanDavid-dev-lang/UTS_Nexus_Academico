import { AuditModel } from '../models/audit.model.js';

/**
 * Deja constancia de un cambio. **Nunca tumba la petición que lo produjo.**
 *
 * La auditoría se escribe *después* de que el cambio ya ocurrió. Si falla y se
 * propaga el error, el resultado es el peor de los tres posibles: el cambio
 * está hecho, no está auditado, y encima al cliente se le ha dicho que falló.
 * Quien lo ve vuelve a intentarlo y deshace lo que sí había funcionado —que es
 * exactamente lo que pasaba al abrir el registro de docentes, donde dos
 * intentos seguidos dejaban el interruptor donde no tocaba.
 *
 * Fallar aquí no salva el registro de auditoría; solo añade un segundo
 * problema. Así que se registra ruidosamente en el servidor, donde alguien
 * puede verlo, y la petición sigue su curso contando la verdad de lo que hizo.
 */
export async function auditChange(input: {
  actorId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
  userAgent?: string | null;
}) {
  try {
    await AuditModel.create({
      actorId: input.actorId ?? null,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? null,
      before: input.before ?? null,
      after: input.after ?? null,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    });
  } catch (causa) {
    console.error(
      `[auditoria] no se pudo registrar ${input.action} sobre ${input.entity}` +
        `${input.entityId ? ` (${input.entityId})` : ''}:`,
      causa,
    );
  }
}

