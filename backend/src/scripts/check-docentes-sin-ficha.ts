/**
 * Comprobación de solo lectura: cuentas PROFESSOR sin ficha de docente.
 *
 * El autorregistro creaba la cuenta y después la ficha, sin deshacer la
 * primera si la segunda fallaba. Esa cuenta no tiene estado PENDIENTE que el
 * login pueda comprobar, así que entraba sin que nadie la aprobara. Hoy el
 * registro deshace la cuenta, y el alta desde Personal y el cambio de rol
 * crean la ficha; lo que encuentre este script viene de antes.
 *
 * No escribe nada. Para cada cuenta listada, la administración decide: si es
 * de un docente real, cambiarle el rol en Personal crea su ficha aprobada; si
 * no, se da de baja.
 *
 * Uso:  npm run check:docentes-sin-ficha
 */
import mongoose from 'mongoose';
import { connectDbOrThrow } from '../shared/db.js';
import { UserModel } from '../models/user.model.js';
import { ProfessorModel } from '../models/professor.model.js';

async function main() {
  await connectDbOrThrow();

  const conFicha = await ProfessorModel.distinct('userId', { deletedAt: null });
  const huerfanas = await UserModel.find({ role: 'PROFESSOR', _id: { $nin: conFicha } })
    .select('email fullName createdAt lastLoginAt')
    .sort({ createdAt: 1 })
    .lean();

  if (huerfanas.length === 0) {
    console.info('Ninguna cuenta de docente sin ficha.');
  } else {
    console.info(`${huerfanas.length} cuenta(s) de docente sin ficha:`);
    for (const u of huerfanas) {
      const creada = u.createdAt ? new Date(u.createdAt).toISOString().slice(0, 10) : '¿?';
      const ultimo = u.lastLoginAt ? new Date(u.lastLoginAt).toISOString().slice(0, 10) : 'nunca';
      console.info(`  ${u.email}  ${u.fullName ?? ''}  creada ${creada}  último acceso ${ultimo}`);
    }
  }
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect();
  process.exit(1);
});
