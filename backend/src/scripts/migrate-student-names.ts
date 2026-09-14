/**
 * Normaliza el nombre de los estudiantes ya guardados: solo letras y espacios,
 * en mayúsculas (`JUAN CARLOS PÉREZ GÓMEZ`), igual que lo guarda UniPlanner.
 *
 * Uso:
 *   npm run migrate:nombres-estudiantes            # simulación: no escribe nada
 *   npm run migrate:nombres-estudiantes -- --aplicar
 *
 * La verificación automática del enlace ya compara sin mayúsculas ni tildes,
 * así que esto no la desbloquea: deja los datos en una sola forma para que las
 * listas, las actas y lo que se compare mañana no dependan de cómo se escribió
 * cada nombre. Los que tienen números u otros símbolos no se tocan: se listan
 * para corregirlos a mano, porque adivinar un nombre es peor que dejarlo.
 *
 * Idempotente. Antes de escribir guarda el nombre anterior en
 * `estudiantes_respaldo_nombres`.
 */
import mongoose from 'mongoose';
import { connectDbOrThrow } from '../shared/db.js';
import { StudentModel } from '../models/student.model.js';
import { auditChange } from '../shared/audit.js';
import { limpiarNombrePersona } from '../shared/validation.js';

const aplicar = process.argv.includes('--aplicar');
const RESPALDO = 'estudiantes_respaldo_nombres';
const VALIDO = /^\p{L}+( \p{L}+)*$/u;

async function main() {
  await connectDbOrThrow();
  console.info(aplicar ? 'Modo: APLICAR (escribe en la base).' : 'Modo: simulación (no escribe nada).');

  const estudiantes = await StudentModel.find({ deletedAt: null }).select('_id fullName').lean();
  const cambios: { id: mongoose.Types.ObjectId; antes: string; despues: string }[] = [];
  const aMano: string[] = [];
  for (const e of estudiantes) {
    const antes = String(e.fullName ?? '');
    const despues = limpiarNombrePersona(antes);
    if (!VALIDO.test(despues) || despues.length < 3) {
      aMano.push(String(e._id));
      continue;
    }
    if (despues !== antes) cambios.push({ id: e._id as mongoose.Types.ObjectId, antes, despues });
  }

  console.info(`Estudiantes vivos:            ${estudiantes.length}`);
  console.info(`Nombres a normalizar:         ${cambios.length}`);
  console.info(`Con números o símbolos (a mano): ${aMano.length}${aMano.length ? ` — ids: ${aMano.slice(0, 10).join(', ')}` : ''}`);
  // Solo la forma, no el nombre: se ve qué cambia sin volcar datos personales.
  for (const c of cambios.slice(0, 5)) {
    const forma = (s: string) => s.replace(/\p{Lu}/gu, 'A').replace(/\p{Ll}/gu, 'a');
    console.info(`  ${forma(c.antes)}  →  ${forma(c.despues)}`);
  }

  if (!aplicar) {
    console.info('\nNada escrito. Para aplicarlo: npm run migrate:nombres-estudiantes -- --aplicar');
    return;
  }
  if (cambios.length === 0) {
    console.info('\nNada que hacer.');
    return;
  }

  await mongoose.connection.collection(RESPALDO).bulkWrite(
    cambios.map((c) => ({
      replaceOne: {
        filter: { _id: c.id },
        replacement: { fullName: c.antes, _migradoEn: new Date() },
        upsert: true,
      },
    })),
    { ordered: false },
  );
  await StudentModel.bulkWrite(
    cambios.map((c) => ({ updateOne: { filter: { _id: c.id }, update: { $set: { fullName: c.despues } } } })),
    { ordered: false },
  );
  await auditChange({
    actorId: null,
    action: 'MIGRATION',
    entity: 'Estudiante',
    entityId: null,
    before: null,
    after: { migracion: 'nombres-en-mayusculas', normalizados: cambios.length, aMano: aMano.length, respaldo: RESPALDO },
  });
  console.info(`\nNormalizados ${cambios.length}; nombres anteriores en «${RESPALDO}».`);
}

main()
  .catch((err) => {
    console.error('La migración falló:', err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
