/**
 * Migración de la evolución v3: periodos, retrasos de asistencia y actividades.
 *
 * Uso:
 *   npm run migrate:v3            # simulación: no escribe nada
 *   npm run migrate:v3 -- --aplicar
 *
 * **Empieza en simulación a propósito.** Estos pasos tocan tres colecciones
 * completas sobre datos reales de estudiantes; un script que escribe por
 * defecto se ejecuta «para ver qué hace» y ya no hay vuelta atrás. Con
 * `--aplicar` explícito, ver qué hace no cuesta nada.
 *
 * Es **idempotente y reanudable**: cada paso solo toca lo que todavía no
 * cumple el estado final (`$exists: false`, `period: ''`, periodo sin
 * documento), así que interrumpirla y volver a lanzarla continúa donde estaba
 * sin duplicar nada.
 *
 * ── Recuperación ──────────────────────────────────────────────────────────
 * Ningún paso borra ni sustituye datos: los tres AÑADEN un campo o un
 * documento que antes no existía. Deshacerlos, si hiciera falta:
 *
 *   db.asistencias.updateMany({}, { $unset: { lateMinutes: '' } })
 *   db.actividades.updateMany({}, { $set: { period: '' } })
 *   db.periodos_academicos.deleteMany({ state: 'OPEN', closedAt: null })
 *
 * Lo que NO hay que deshacer así es un periodo ya cerrado: borrar su documento
 * dejaría la fotografía huérfana y el semestre volvería a admitir escrituras.
 */
import mongoose from 'mongoose';
import { connectDbOrThrow } from '../shared/db.js';
import { AttendanceModel } from '../models/attendance.model.js';
import { ActivityModel } from '../models/activity.model.js';
import { GroupModel } from '../models/group.model.js';
import { GradeModel } from '../models/grade.model.js';
import { EnrollmentModel } from '../models/enrollment.model.js';
import { AcademicPeriodModel } from '../models/academic-period.model.js';

const aplicar = process.argv.includes('--aplicar');

function paso(titulo: string) {
  console.log(`\n── ${titulo} ${'─'.repeat(Math.max(0, 60 - titulo.length))}`);
}

/**
 * Paso 1: registra los periodos que ya existen en los datos.
 *
 * Antes de esto, `period` era solo una cadena repartida por notas y
 * matrículas: nadie sabía si un semestre seguía abierto. Los que ya hay se
 * registran como `OPEN`, que es exactamente lo que eran de hecho — marcarlos
 * cerrados sin fotografía dejaría la institución en solo lectura de golpe.
 */
async function registrarPeriodos(): Promise<{ detectados: number; creados: number }> {
  paso('Periodos académicos');

  const [deNotas, deMatriculas] = await Promise.all([
    GradeModel.distinct('period', { deletedAt: null }),
    EnrollmentModel.distinct('period', { deletedAt: null }),
  ]);
  const periodos = [...new Set([...deNotas, ...deMatriculas].map(String).filter(Boolean))].sort();

  const existentes = new Set(
    (await AcademicPeriodModel.find({}).select('period').lean()).map(d => String(d.period)),
  );
  const faltantes = periodos.filter(periodo => !existentes.has(periodo));

  console.log(`  Periodos con datos: ${periodos.length} (${periodos.join(', ') || 'ninguno'})`);
  console.log(`  Sin documento propio: ${faltantes.length}`);

  if (aplicar && faltantes.length > 0) {
    await AcademicPeriodModel.bulkWrite(
      faltantes.map(periodo => ({
        updateOne: {
          filter: { period: periodo },
          update: { $setOnInsert: { period: periodo, state: 'OPEN' } },
          upsert: true,
        },
      })),
      { ordered: false },
    );
    console.log(`  Creados ${faltantes.length} documento(s) de periodo en estado OPEN.`);
  }

  return { detectados: periodos.length, creados: aplicar ? faltantes.length : 0 };
}

/**
 * Paso 2: pone `lateMinutes: 0` en la asistencia anterior a su captura.
 *
 * **Cero, no un valor inventado.** Un listado escaneado o una lista pegada no
 * traen la hora de llegada; deducir un retraso de ahí abriría casos de
 * seguimiento sobre estudiantes puntuales, que es peor que no detectar nada.
 * El dominio ya trata la ausencia del campo como puntual, así que este paso es
 * cosmético — existe para que las consultas por `lateMinutes` no tengan que
 * contemplar el `null`.
 */
async function rellenarRetrasos(): Promise<number> {
  paso('Retraso en asistencia (lateMinutes)');

  const pendientes = await AttendanceModel.countDocuments({ lateMinutes: { $exists: false } });
  console.log(`  Registros sin el campo: ${pendientes}`);

  if (aplicar && pendientes > 0) {
    const resultado = await AttendanceModel.updateMany(
      { lateMinutes: { $exists: false } },
      { $set: { lateMinutes: 0 } },
    );
    console.log(`  Actualizados ${resultado.modifiedCount}.`);
    return resultado.modifiedCount;
  }
  return 0;
}

/**
 * Paso 3: hereda el periodo de la actividad desde su grupo.
 *
 * Las actividades nacieron sin `period` porque nadie filtraba por semestre.
 * Ahora el cierre y los listados lo necesitan. Las que no tienen grupo se
 * quedan sin periodo: inventarlo a partir de la fecha límite acertaría casi
 * siempre y fallaría justo en las de enero y julio, que es cuando importa.
 */
async function rellenarPeriodoDeActividades(): Promise<number> {
  paso('Periodo de las actividades');

  const sinPeriodo = await ActivityModel.find({
    deletedAt: null,
    $or: [{ period: '' }, { period: { $exists: false } }, { period: null }],
  })
    .select('_id groupId')
    .lean();

  const conGrupo = sinPeriodo.filter(a => a.groupId);
  console.log(`  Actividades sin periodo: ${sinPeriodo.length} (con grupo: ${conGrupo.length})`);

  if (conGrupo.length === 0) return 0;

  const grupos = await GroupModel.find({ _id: { $in: conGrupo.map(a => a.groupId) } })
    .select('period')
    .lean();
  const periodoDeGrupo = new Map(grupos.map(g => [String(g._id), String(g.period ?? '')]));

  const operaciones = conGrupo
    .map(actividad => ({ actividad, periodo: periodoDeGrupo.get(String(actividad.groupId)) }))
    .filter((fila): fila is { actividad: (typeof conGrupo)[number]; periodo: string } => Boolean(fila.periodo));

  console.log(`  Resolubles desde el grupo: ${operaciones.length}`);
  if (!aplicar || operaciones.length === 0) return 0;

  await ActivityModel.bulkWrite(
    operaciones.map(({ actividad, periodo }) => ({
      updateOne: { filter: { _id: actividad._id }, update: { $set: { period: periodo } } },
    })),
    { ordered: false },
  );
  console.log(`  Actualizadas ${operaciones.length}.`);
  return operaciones.length;
}

/**
 * Paso 4: sincroniza los índices nuevos.
 *
 * Va el último y solo con `--aplicar`. Un índice único sobre datos que ya
 * tienen duplicados falla al crearse, y ese fallo tiene que ocurrir DESPUÉS de
 * que los pasos anteriores hayan dejado los datos consistentes; al revés, el
 * script se caería antes de arreglar nada. Se informa del conflicto en vez de
 * dejar el proceso a medias sin decir por qué.
 */
async function sincronizarIndices(): Promise<void> {
  paso('Índices');
  if (!aplicar) {
    console.log('  (simulación: no se crean índices)');
    return;
  }

  const modelos = [AttendanceModel, ActivityModel, AcademicPeriodModel];
  for (const modelo of modelos) {
    try {
      await modelo.syncIndexes();
      console.log(`  ${modelo.collection.name}: índices al día.`);
    } catch (causa) {
      console.error(
        `  ${modelo.collection.name}: no se pudieron crear los índices. ` +
          'Suele significar que hay documentos duplicados que un índice único rechaza.',
        causa,
      );
    }
  }
}

async function main() {
  await connectDbOrThrow();

  console.log(
    aplicar
      ? '\nMIGRACIÓN v3 — MODO APLICAR: se van a escribir cambios.'
      : '\nMIGRACIÓN v3 — SIMULACIÓN. Nada se escribe. Añade --aplicar para ejecutarla.',
  );

  await registrarPeriodos();
  await rellenarRetrasos();
  await rellenarPeriodoDeActividades();
  await sincronizarIndices();

  console.log(
    aplicar
      ? '\nMigración completada.\n'
      : '\nSimulación completada. Vuelve a lanzarla con --aplicar para escribir.\n',
  );
  await mongoose.disconnect();
}

main().catch(async err => {
  console.error(err);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
