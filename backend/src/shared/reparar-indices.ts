/**
 * Decide qué hacer con un índice declarado en un modelo que la base tiene
 * distinto (o no tiene).
 *
 * Existe porque `autoIndex` no repara nada: si en la base ya hay un índice con
 * el mismo nombre y otras opciones —un `expiresAt_1` sin TTL, un `signature_1`
 * sin `unique`—, `createIndex` falla con `IndexOptionsConflict`, Mongoose lo
 * traga y la colección sigue con el índice viejo para siempre. Se descubre
 * meses después, cuando las sesiones vencidas se cuentan por cientos.
 *
 * Puro: recibe lo que hay y lo que se quiere, devuelve el plan. Quien ejecuta
 * es `scripts/repair-indexes.ts`.
 */

export type ClaveIndice = Record<string, 1 | -1 | string>;

/** Las opciones que cambian el comportamiento de un índice; el resto no importa. */
export interface OpcionesIndice {
  unique?: boolean;
  expireAfterSeconds?: number;
  partialFilterExpression?: Record<string, unknown>;
  sparse?: boolean;
}

export interface IndiceExistente extends OpcionesIndice {
  name: string;
  key: ClaveIndice;
}

export interface IndiceDeseado {
  key: ClaveIndice;
  opciones: OpcionesIndice;
}

export type PlanIndice =
  | { accion: 'nada'; motivo: string }
  | { accion: 'crear'; nombre: string; motivo: string }
  | { accion: 'reemplazar'; nombre: string; anterior: IndiceExistente; motivo: string };

/** Nombre que Mongo le da por defecto a un índice: `campo_1_otro_-1`. */
export function nombrePorDefecto(key: ClaveIndice): string {
  return Object.entries(key)
    .map(([campo, dir]) => `${campo}_${dir}`)
    .join('_');
}

/** Igualdad de claves respetando el orden de los campos, que en Mongo importa. */
export function mismaClave(a: ClaveIndice, b: ClaveIndice): boolean {
  const ea = Object.entries(a);
  const eb = Object.entries(b);
  return ea.length === eb.length && ea.every(([campo, dir], i) => eb[i]?.[0] === campo && String(eb[i]?.[1]) === String(dir));
}

/**
 * Serializa con las claves ordenadas: `{a:1,b:2}` y `{b:2,a:1}` son el mismo
 * filtro parcial aunque `JSON.stringify` diga lo contrario.
 */
function canonico(valor: unknown): string {
  if (valor === null || typeof valor !== 'object') return JSON.stringify(valor ?? null);
  if (Array.isArray(valor)) return `[${valor.map(canonico).join(',')}]`;
  const entradas = Object.entries(valor as Record<string, unknown>).sort(([x], [y]) => x.localeCompare(y));
  return `{${entradas.map(([k, v]) => `${JSON.stringify(k)}:${canonico(v)}`).join(',')}}`;
}

/** Lista legible de las opciones que difieren; vacía si coinciden. */
export function diferenciasDeOpciones(actual: OpcionesIndice, deseado: OpcionesIndice): string[] {
  const difs: string[] = [];
  if (Boolean(actual.unique) !== Boolean(deseado.unique)) {
    difs.push(`unique: ${Boolean(actual.unique)} → ${Boolean(deseado.unique)}`);
  }
  if (Boolean(actual.sparse) !== Boolean(deseado.sparse)) {
    difs.push(`sparse: ${Boolean(actual.sparse)} → ${Boolean(deseado.sparse)}`);
  }
  if ((actual.expireAfterSeconds ?? null) !== (deseado.expireAfterSeconds ?? null)) {
    difs.push(`expireAfterSeconds: ${actual.expireAfterSeconds ?? 'sin TTL'} → ${deseado.expireAfterSeconds ?? 'sin TTL'}`);
  }
  if (canonico(actual.partialFilterExpression) !== canonico(deseado.partialFilterExpression)) {
    difs.push(
      `partialFilterExpression: ${canonico(actual.partialFilterExpression)} → ${canonico(deseado.partialFilterExpression)}`,
    );
  }
  return difs;
}

export function planearIndice(existentes: IndiceExistente[], deseado: IndiceDeseado): PlanIndice {
  const conMismaClave = existentes.filter((i) => mismaClave(i.key, deseado.key));
  const correcto = conMismaClave.find((i) => diferenciasDeOpciones(i, deseado.opciones).length === 0);
  if (correcto) return { accion: 'nada', motivo: `«${correcto.name}» ya coincide con el modelo` };

  // Se sustituye el que tiene la misma clave: es el que bloquea el nombre por
  // defecto y el que Mongo usaría en su lugar. Con dos variantes de la misma
  // clave (raro, pero posible con nombres a mano) se elige la de nombre por
  // defecto, que es la que el modelo intenta crear.
  const nombre = nombrePorDefecto(deseado.key);
  const anterior = conMismaClave.find((i) => i.name === nombre) ?? conMismaClave[0];
  if (!anterior) return { accion: 'crear', nombre, motivo: 'no existe en la base' };
  return {
    accion: 'reemplazar',
    nombre,
    anterior,
    motivo: diferenciasDeOpciones(anterior, deseado.opciones).join('; '),
  };
}

/** Valores que impedirían crear un índice único: los que aparecen en más de un documento. */
export function valoresRepetidos(pares: { valor: string; docId: string }[]): { valor: string; docs: number }[] {
  const porValor = new Map<string, Set<string>>();
  for (const { valor, docId } of pares) {
    const docs = porValor.get(valor) ?? new Set<string>();
    docs.add(docId);
    porValor.set(valor, docs);
  }
  return [...porValor.entries()]
    .filter(([, docs]) => docs.size > 1)
    .map(([valor, docs]) => ({ valor, docs: docs.size }));
}
