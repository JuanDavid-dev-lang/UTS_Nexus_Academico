/**
 * Migración: normaliza los arreglos legados `studentIds[]` de Grupo/Materia a la
 * colección Matrícula. Idempotente: se puede correr varias veces sin duplicar.
 *
 * Uso:  npm run build && node dist/scripts/migrate-enrollments.js
 */
import mongoose from 'mongoose';
import { env } from '../shared/env.js';
import { GroupModel } from '../models/group.model.js';
import { EnrollmentModel } from '../models/enrollment.model.js';

async function main() {
  if (!env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  await mongoose.connect(env.MONGODB_URI);

  const groups = await GroupModel.find({ deletedAt: null }).lean();
  let creadas = 0;

  for (const group of groups) {
    const studentIds = (group.studentIds ?? []) as unknown[];
    for (const studentId of studentIds) {
      const result = await EnrollmentModel.updateOne(
        { studentId, groupId: group._id, period: group.period },
        {
          $setOnInsert: {
            studentId,
            groupId: group._id,
            subjectId: group.subjectId,
            professorId: group.professorId,
            period: group.period,
            enrollmentStatus: 'ACTIVE',
          },
        },
        { upsert: true }
      );
      if (result.upsertedCount) creadas += 1;
    }
  }

  console.log(`Migración completada. Matrículas creadas: ${creadas} (sobre ${groups.length} grupos).`);
  await mongoose.disconnect();
}

main().catch(async err => {
  console.error(err);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
