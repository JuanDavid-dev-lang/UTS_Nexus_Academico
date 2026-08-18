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


/**
 * Deja constancia de **muchos** cambios en una sola escritura.
 *
 * Las importaciones masivas auditaban registro a registro, y eso convertía la
 * auditoría en el cuello de botella que quedaba después de agrupar las
 * escrituras: una planilla de 500 estudiantes por 10 columnas dejaba 5.000
 * inserciones sueltas, cada una con su ida y vuelta a Atlas. Agruparlas no
 * cambia lo que queda registrado, solo cuántas veces se pregunta.
 *
 * Comparte con `auditChange` la promesa que importa: **nunca tumba la petición
 * que la produjo**. Fallar aquí no salva el registro y sí añade un segundo
 * problema sobre un cambio que ya está hecho.
 */
export async function auditBatch(
  entradas: Array<{
    actorId?: string | null;
    action: string;
    entity: string;
    entityId?: string | null;
    before?: unknown;
    after?: unknown;
  }>,
): Promise<void> {
  if (entradas.length === 0) return;
  try {
    await AuditModel.insertMany(
      entradas.map(entrada => ({
        actorId: entrada.actorId ?? null,
        action: entrada.action,
        entity: entrada.entity,
        entityId: entrada.entityId ?? null,
        before: entrada.before ?? null,
        after: entrada.after ?? null,
        ip: null,
        userAgent: null,
      })),
      // Un documento que falle no debe llevarse por delante a los demás: la
      // auditoría parcial vale más que ninguna.
      { ordered: false },
    );
  } catch (causa) {
    console.error(
      `[auditoria] no se pudieron registrar ${entradas.length} cambios sobre ` +
        `${entradas[0]?.entity ?? 'desconocido'}:`,
      causa,
    );
  }
}
