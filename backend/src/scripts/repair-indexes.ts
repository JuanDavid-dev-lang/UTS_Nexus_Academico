/**
 * Repara tres índices que los modelos declaran y que la base tiene distintos.
 *
 * Uso:
 *   npm run migrate:indices              # simulación: no escribe nada
 *   npm run migrate:indices -- --aplicar
 *
 * Qué arregla (encontrado en la base de producción en noviembre de 2026):
 *
 * - `sesiones.expiresAt_1` existía **sin TTL**. El modelo pide
 *   `expireAfterSeconds: 0` para que Mongo borre las sesiones caducadas, pero
 *   el índice viejo ocupaba el nombre y `autoIndex` fallaba en silencio: 249 de
 *   250 sesiones estaban vencidas y nada las borraba. **Al crearlo, Mongo borra
 *   en segundo plano todas las sesiones con `expiresAt` en el pasado**; ninguna
 *   de ellas sirve ya para renovar.
 * - `errores_cliente.signature_1` y `instituciones.clavesBusqueda_1` eran
 *   índices normales donde el modelo pide uno único. Los dos campos llevaban
 *   además `index: true`, que creaba primero el normal con el mismo nombre; de
 *   ahí el aviso «Duplicate schema index» en cada arranque.
 *
 * No usa `syncIndexes()`: borraría `estudiantes_email_activo_unico`, que existe
 * a propósito y no está declarado en el modelo (lo crea
 * `migrate-student-emails.ts`). Solo toca los índices de esta lista.
 *
 * Antes de crear un índice único comprueba que no haya valores repetidos; si
 * los hay, ese índice se salta y se listan. Si crear el nuevo falla después de
 * borrar el viejo, se restaura el viejo. Idempotente.
 */
import mongoose from 'mongoose';
import { connectDbOrThrow } from '../shared/db.js';
import { auditChange } from '../shared/audit.js';
import { SessionModel } from '../models/session.model.js';
import { ClientErrorModel } from '../models/client-error.model.js';
import { InstitutionModel } from '../models/institution.model.js';
import {
  type ClaveIndice,
  type IndiceDeseado,
  type IndiceExistente,
  type OpcionesIndice,
  mismaClave,
  planearIndice,
  valoresRepetidos,
} from '../shared/reparar-indices.js';

const aplicar = process.argv.includes('--aplicar');

/** Lo único que el script usa de un modelo; evita `Model<any>`. */
interface ModeloConIndices {
  modelName: string;
  schema: mongoose.Schema;
  collection: mongoose.Collection;
}

interface Objetivo {
  modelo: ModeloConIndices;
  key: ClaveIndice;
  /** Pares (valor, documento) del campo, para comprobar unicidad antes de crear. */
  valores?: () => Promise<{ valor: string; docId: string }[]>;
}

const OBJETIVOS: Objetivo[] = [
  { modelo: SessionModel, key: { expiresAt: 1 } },
  {
    modelo: ClientErrorModel,
    key: { signature: 1 },
    valores: async () =>
      (await ClientErrorModel.find({}, { signature: 1 }).lean()).map((d) => ({
        valor: String(d.signature),
        docId: String(d._id),
      })),
  },
  {
    modelo: InstitutionModel,
    key: { clavesBusqueda: 1 },
    // El filtro parcial del índice es `deletedAt: null`: solo cuentan las vivas.
    valores: async () =>
      (await InstitutionModel.find({ deletedAt: null }, { clavesBusqueda: 1 }).lean()).flatMap((d) =>
        ((d.clavesBusqueda as string[] | undefined) ?? []).map((valor) => ({ valor, docId: String(d._id) })),
      ),
  },
];

/** La definición sale del esquema, no se copia: así no puede divergir del modelo. */
function deseadoDesdeModelo(modelo: ModeloConIndices, key: ClaveIndice): IndiceDeseado {
  const entrada = modelo.schema.indexes().find(([k]) => mismaClave(k as ClaveIndice, key));
  if (!entrada) throw new Error(`${modelo.modelName} no declara un índice ${JSON.stringify(key)}`);
  const [, opciones = {}] = entrada as [ClaveIndice, Record<string, unknown>];
  const deseado: OpcionesIndice = {};
  if (opciones.unique) deseado.unique = true;
  if (opciones.sparse) deseado.sparse = true;
  if (typeof opciones.expireAfterSeconds === 'number') deseado.expireAfterSeconds = opciones.expireAfterSeconds;
  if (opciones.partialFilterExpression) {
    deseado.partialFilterExpression = opciones.partialFilterExpression as Record<string, unknown>;
  }
  return { key, opciones: deseado };
}

function opcionesDeExistente(i: IndiceExistente): Record<string, unknown> {
  const o: Record<string, unknown> = { name: i.name };
  if (i.unique) o.unique = true;
  if (i.sparse) o.sparse = true;
  if (typeof i.expireAfterSeconds === 'number') o.expireAfterSeconds = i.expireAfterSeconds;
  if (i.partialFilterExpression) o.partialFilterExpression = i.partialFilterExpression;
  return o;
}

async function procesar(obj: Objetivo): Promise<string> {
  const coleccion = obj.modelo.collection;
  const etiqueta = `${coleccion.collectionName}.${Object.keys(obj.key).join('_')}`;
  const deseado = deseadoDesdeModelo(obj.modelo, obj.key);
  const existentes = (await coleccion.indexes()) as unknown as IndiceExistente[];
  const plan = planearIndice(existentes, deseado);

  console.info(`\n${etiqueta}`);
  console.info(`  modelo: ${JSON.stringify(deseado.opciones)}`);
  if (plan.accion === 'nada') {
    console.info(`  ✓ ${plan.motivo}`);
    return 'sin cambios';
  }
  console.info(`  → ${plan.accion} «${plan.nombre}»: ${plan.motivo}`);

  if (deseado.opciones.unique && obj.valores) {
    const repetidos = valoresRepetidos(await obj.valores());
    if (repetidos.length > 0) {
      console.info(`  ✗ ${repetidos.length} valor(es) en más de un documento; no se puede crear el índice único:`);
      for (const r of repetidos.slice(0, 10)) console.info(`      «${r.valor}» en ${r.docs} documentos`);
      return 'bloqueado por duplicados';
    }
    console.info('  ✓ sin valores repetidos');
  }

  if (coleccion.collectionName === 'sesiones' && deseado.opciones.expireAfterSeconds !== undefined) {
    const vencidas = await SessionModel.countDocuments({ expiresAt: { $lt: new Date() } });
    console.info(`  ! al crearlo, Mongo borrará ${vencidas} sesión(es) ya vencidas`);
  }

  if (!aplicar) return `pendiente (${plan.accion})`;

  if (plan.accion === 'reemplazar') await coleccion.dropIndex(plan.anterior.name);
  try {
    await coleccion.createIndex(deseado.key as mongoose.mongo.IndexSpecification, { ...deseado.opciones, name: plan.nombre });
  } catch (err) {
    if (plan.accion === 'reemplazar') {
      console.error('  ✗ falló la creación; restaurando el índice anterior');
      await coleccion.createIndex(plan.anterior.key as mongoose.mongo.IndexSpecification, opcionesDeExistente(plan.anterior));
    }
    throw err;
  }
  console.info('  ✓ aplicado');
  return plan.accion === 'reemplazar' ? 'reemplazado' : 'creado';
}

async function main() {
  await connectDbOrThrow();
  console.info(aplicar ? 'Modo: APLICAR (escribe en la base).' : 'Modo: simulación (no escribe nada).');

  const resultados: Record<string, string> = {};
  for (const obj of OBJETIVOS) {
    resultados[obj.modelo.collection.collectionName] = await procesar(obj);
  }

  console.info('\nResumen:');
  for (const [col, r] of Object.entries(resultados)) console.info(`  ${col}: ${r}`);

  if (!aplicar) {
    console.info('\nNada escrito. Para aplicarlo: npm run migrate:indices -- --aplicar');
    return;
  }
  const cambiados = Object.values(resultados).filter((r) => r === 'reemplazado' || r === 'creado').length;
  if (cambiados > 0) {
    await auditChange({
      actorId: null,
      action: 'MIGRATION',
      entity: 'Indices',
      entityId: null,
      before: null,
      after: { migracion: 'reparar-indices', resultados },
    });
  }
}

main()
  .catch((err) => {
    console.error('La migración falló:', err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
