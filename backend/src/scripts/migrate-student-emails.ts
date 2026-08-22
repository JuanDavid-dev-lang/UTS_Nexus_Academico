/**
 * Audita y normaliza correos de estudiantes.
 *
 * Uso:
 *   npm run migrate:student-emails              # simulación, no escribe
 *   npm run migrate:student-emails -- --aplicar # normaliza y crea el índice
 *
 * La aplicación se detiene si encuentra correos inválidos o duplicados entre
 * expedientes activos. Ningún dato se inventa ni se elimina. Para revertir el
 * índice (los valores normalizados se conservan):
 *   db.estudiantes.dropIndex('estudiantes_email_activo_unico')
 */
import mongoose from 'mongoose';
import { z } from 'zod';
import { connectDbOrThrow } from '../shared/db.js';

const aplicar = process.argv.includes('--aplicar');
const emailSchema = z.string().trim().toLowerCase().email().max(254);

type StudentEmailRow = { _id: mongoose.Types.ObjectId; code?: string; email?: unknown };

export function auditStudentEmails(rows: StudentEmailRow[]) {
  const missing: StudentEmailRow[] = [];
  const emptyToNull: mongoose.Types.ObjectId[] = [];
  const invalid: Array<StudentEmailRow & { normalized?: string }> = [];
  const updates: Array<{ id: mongoose.Types.ObjectId; email: string }> = [];
  const byEmail = new Map<string, StudentEmailRow[]>();

  for (const row of rows) {
    if (typeof row.email !== 'string' || row.email.trim() === '') {
      missing.push(row);
      if (typeof row.email === 'string') emptyToNull.push(row._id);
      continue;
    }
    const parsed = emailSchema.safeParse(row.email);
    if (!parsed.success) {
      invalid.push({ ...row, normalized: row.email.trim().toLowerCase() });
      continue;
    }
    const normalized = parsed.data;
    if (normalized !== row.email) updates.push({ id: row._id, email: normalized });
    byEmail.set(normalized, [...(byEmail.get(normalized) ?? []), row]);
  }

  const duplicates = [...byEmail.entries()]
    .filter(([, owners]) => owners.length > 1)
    .map(([email, owners]) => ({ email, codes: owners.map(owner => owner.code ?? String(owner._id)) }));
  return { missing, emptyToNull, invalid, updates, duplicates };
}

async function main() {
  await connectDbOrThrow();
  const collection = mongoose.connection.collection('estudiantes');
  const rows = await collection.find(
    { deletedAt: null },
    { projection: { code: 1, email: 1 } },
  ).toArray() as StudentEmailRow[];
  const report = auditStudentEmails(rows);

  console.log(`Modo: ${aplicar ? 'APLICACIÓN' : 'SIMULACIÓN'}`);
  console.log(`Estudiantes activos: ${rows.length}`);
  console.log(`Sin correo: ${report.missing.length}`);
  console.log(`Correos inválidos: ${report.invalid.length}`);
  console.log(`Correos duplicados: ${report.duplicates.length}`);
  console.log(`Correos por normalizar: ${report.updates.length}`);
  console.log(`Correos vacíos por convertir a null: ${report.emptyToNull.length}`);
  if (report.invalid.length) console.log('Inválidos:', report.invalid.map(row => row.code ?? String(row._id)));
  if (report.duplicates.length) console.log('Duplicados:', report.duplicates);

  if (!aplicar) {
    console.log('\nSimulación terminada. Usa -- --aplicar después de resolver inválidos y duplicados.');
    return;
  }
  if (report.invalid.length || report.duplicates.length) {
    throw new Error('No se aplicó ningún cambio: resuelve los correos inválidos o duplicados primero.');
  }

  const operations = [
    ...report.updates.map(update => ({
      updateOne: { filter: { _id: update.id }, update: { $set: { email: update.email } } },
    })),
    ...report.emptyToNull.map(id => ({
      updateOne: { filter: { _id: id }, update: { $set: { email: null } } },
    })),
  ];
  if (operations.length) {
    await collection.bulkWrite(operations, { ordered: false });
  }
  await collection.createIndex(
    { email: 1 },
    {
      name: 'estudiantes_email_activo_unico',
      unique: true,
      partialFilterExpression: { deletedAt: null, email: { $type: 'string' } },
    },
  );
  console.log('Migración aplicada e índice único parcial verificado.');
}

if (process.argv[1]?.includes('migrate-student-emails')) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }).finally(() => mongoose.disconnect());
}
