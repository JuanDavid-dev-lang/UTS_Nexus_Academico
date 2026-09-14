/**
 * Migración de las fechas de asistencia guardadas antes de normalizarlas.
 *
 * Uso:
 *   npm run migrate:fechas-asistencia            # simulación: no escribe nada
 *   npm run migrate:fechas-asistencia -- --aplicar
 *
 * ── Qué arregla ───────────────────────────────────────────────────────────
 * Cada cliente mandaba el día de la clase a su manera —el escritorio mediodía
 * local, el móvil medianoche sin zona que el servidor leía en la suya, la
 * planilla escaneada medianoche UTC—, y el índice único de Asistencia incluye
 * `date`. La misma clase marcada desde dos sitios quedaba en **dos
 * documentos**, y el porcentaje del estudiante contaba ese día dos veces. Desde
 * `domains/attendance/class-date.ts` toda escritura nueva usa el mediodía del
 * campus; esto deja lo anterior igual:
 *
 *   1. En cada clase con varios registros se queda el vivo modificado más
 *      recientemente —nunca una ausencia automática del QR por encima de un
 *      registro puesto a mano— (`planearMigracionDeFechas`) y los demás se
 *      borran.
 *   2. El que se queda recibe la fecha canónica, si no la tenía.
 *
 * **Empieza en simulación a propósito**, como `migrate:v3`: toca datos reales
 * de estudiantes y borra documentos. Es **idempotente**: sobre datos ya
 * migrados no hace nada.
 *
 * ── Recuperación ──────────────────────────────────────────────────────────
 * Antes de borrar, cada duplicado se copia entero a `asistencias_respaldo_fechas`
 * con el id del registro que se quedó (`_conservado`). Para devolver uno:
 *
 *   const r = db.asistencias_respaldo_fechas.findOne({ _id: ObjectId('…') })
 *   delete r._conservado; delete r._migradoEn
 *   db.asistencias.insertOne(r)      // antes, borrar o mover el conservado
 *
 * Las fechas normalizadas no se respaldan: el cambio es de instante, no de día,
 * y el día es lo único que leen los clientes.
 */
import mongoose, { Types } from 'mongoose';
import { connectDbOrThrow } from '../shared/db.js';
import { env } from '../shared/env.js';
import { AttendanceModel } from '../models/attendance.model.js';
import { auditChange } from '../shared/audit.js';
import { planearMigracionDeFechas, type RegistroParaMigrar } from '../domains/attendance/class-date.js';

const aplicar = process.argv.includes('--aplicar');
const RESPALDO = 'asistencias_respaldo_fechas';
const TANDA = 1000;

async function main() {
  await connectDbOrThrow();
  console.log(aplicar ? 'Modo: APLICAR (escribe en la base).' : 'Modo: simulación (no escribe nada).');
  console.log(`Zona del campus: UTC${env.CAMPUS_UTC_OFFSET_MIN / 60 >= 0 ? '+' : ''}${env.CAMPUS_UTC_OFFSET_MIN / 60}`);

  const registros: RegistroParaMigrar[] = [];
  const cursor = AttendanceModel.find({})
    .select('_id studentId subjectId date updatedAt deletedAt present origen')
    .lean()
    .cursor();
  for await (const doc of cursor) {
    registros.push({
      id: String(doc._id),
      studentId: String(doc.studentId),
      subjectId: String(doc.subjectId),
      date: doc.date as Date,
      updatedAt: (doc.updatedAt as Date | undefined) ?? null,
      deletedAt: (doc.deletedAt as Date | null | undefined) ?? null,
      present: doc.present as boolean | undefined,
      origen: (doc.origen as string | null | undefined) ?? null,
    });
  }

  const plan = planearMigracionDeFechas(registros, env.CAMPUS_UTC_OFFSET_MIN);
  console.log(`\nRegistros de asistencia:      ${registros.length}`);
  console.log(`Clases con registros dobles:  ${plan.clasesDuplicadas}`);
  console.log(`Duplicados a borrar:          ${plan.borrar.length}`);
  console.log(`Fechas a normalizar:          ${plan.normalizar.length}`);
  if (plan.sinDia.length > 0) {
    console.log(`Sin día reconocible (no se tocan): ${plan.sinDia.length} — ${plan.sinDia.slice(0, 5).join(', ')}`);
  }

  if (plan.borrar.length > 0) {
    console.log('\nEjemplos de duplicados (se borra → se queda):');
    for (const { id, conservado } of plan.borrar.slice(0, 5)) console.log(`  ${id} → ${conservado}`);
  }

  if (!aplicar) {
    console.log('\nNada escrito. Para aplicarlo: npm run migrate:fechas-asistencia -- --aplicar');
    return;
  }
  if (plan.borrar.length === 0 && plan.normalizar.length === 0) {
    console.log('\nNada que hacer: los datos ya están migrados.');
    return;
  }

  // 1. Respaldo y borrado de duplicados, antes de normalizar: un duplicado que
  //    ya tuviera la fecha canónica impediría dársela al que se queda.
  const respaldo = mongoose.connection.collection(RESPALDO);
  for (let i = 0; i < plan.borrar.length; i += TANDA) {
    const tanda = plan.borrar.slice(i, i + TANDA);
    const ids = tanda.map((b) => new Types.ObjectId(b.id));
    const conservadoDe = new Map(tanda.map((b) => [b.id, b.conservado]));
    const documentos = await AttendanceModel.collection.find({ _id: { $in: ids } }).toArray();
    if (documentos.length > 0) {
      await respaldo.bulkWrite(
        documentos.map((doc) => ({
          replaceOne: {
            filter: { _id: doc._id },
            replacement: { ...doc, _conservado: conservadoDe.get(String(doc._id)), _migradoEn: new Date() },
            upsert: true,
          },
        })),
        { ordered: false },
      );
    }
    await AttendanceModel.collection.deleteMany({ _id: { $in: ids } });
  }
  console.log(`\nRespaldados y borrados ${plan.borrar.length} duplicado(s) en «${RESPALDO}».`);

  // 2. Fecha canónica para los que se quedan.
  for (let i = 0; i < plan.normalizar.length; i += TANDA) {
    await AttendanceModel.collection.bulkWrite(
      plan.normalizar.slice(i, i + TANDA).map(({ id, date }) => ({
        updateOne: { filter: { _id: new Types.ObjectId(id) }, update: { $set: { date } } },
      })),
      { ordered: false },
    );
  }
  console.log(`Normalizadas ${plan.normalizar.length} fecha(s).`);

  await auditChange({
    actorId: null,
    action: 'MIGRATION',
    entity: 'Asistencia',
    entityId: null,
    before: null,
    after: {
      migracion: 'fechas-de-clase',
      duplicadosBorrados: plan.borrar.length,
      fechasNormalizadas: plan.normalizar.length,
      clasesDuplicadas: plan.clasesDuplicadas,
      respaldo: RESPALDO,
    },
  });
}

main()
  .catch((err) => {
    console.error('La migración falló:', err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
