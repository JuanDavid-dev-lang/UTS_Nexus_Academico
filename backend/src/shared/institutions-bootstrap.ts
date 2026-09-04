import { InstitutionModel } from '../models/institution.model.js';
import { ProfessorModel } from '../models/professor.model.js';
import { UserModel } from '../models/user.model.js';
import {
  INSTITUTION_ID_UTS,
  PERFILES_INICIALES,
  clavesDePerfil,
} from '../domains/institutions/institution-profile.js';

/**
 * Deja la instalación con sus perfiles institucionales iniciales.
 *
 * Corre en cada arranque y es idempotente: crea UTS, UIS y UDES **solo si
 * faltan** y no toca los que ya existen —lo que la administración haya
 * editado manda—. Va en el arranque y no en un script porque la promesa de
 * esta capacidad es que nadie tenga que ejecutar nada a mano.
 *
 * También vincula a las UTS a los docentes que no tienen institución y no
 * pidieron ninguna: antes de que existieran los perfiles, todas las cuentas
 * eran de las UTS. Sin este paso, actualizar dejaría a cada docente
 * existente fuera de su institución y su configuración de cortes sin dueño.
 */
export async function asegurarPerfilesIniciales(): Promise<{ creados: string[]; docentesVinculados: number }> {
  const creados: string[] = [];

  for (const perfil of PERFILES_INICIALES) {
    // Incluye los borrados lógicamente: si la administración eliminó uno, no
    // resucita en el siguiente arranque.
    const existe = await InstitutionModel.exists({ institutionId: perfil.institutionId });
    if (existe) continue;
    await InstitutionModel.create({
      institutionId: perfil.institutionId,
      nombre: perfil.nombre,
      sigla: perfil.sigla,
      aliases: perfil.aliases,
      clavesBusqueda: clavesDePerfil(perfil),
      activa: perfil.activa,
      configuracionAcademica: perfil.configuracionAcademica,
      configuradaEn: perfil.configuracionAcademica ? new Date() : null,
    });
    creados.push(perfil.institutionId);
  }

  const uts = await InstitutionModel.findOne({ institutionId: INSTITUTION_ID_UTS, deletedAt: null })
    .select('_id')
    .lean();
  let docentesVinculados = 0;
  if (uts) {
    const resultado = await ProfessorModel.updateMany(
      { institutionId: null, institucionSolicitada: { $in: [null, ''] } },
      { $set: { institutionId: uts._id } },
    );
    docentesVinculados = resultado.modifiedCount;

    // Las cuentas también: la de un docente lleva la de su ficha; coordinación,
    // secretaría y estudiantes anteriores a los perfiles eran de las UTS. ADMIN
    // se queda sin institución a propósito: ve todas.
    const fichas = await ProfessorModel.find({ institutionId: { $ne: null }, deletedAt: null })
      .select('userId institutionId')
      .lean();
    if (fichas.length > 0) {
      await UserModel.bulkWrite(
        fichas.map(ficha => ({
          updateOne: {
            filter: { _id: ficha.userId, institutionId: null, role: { $ne: 'ADMIN' } },
            update: { $set: { institutionId: ficha.institutionId } },
          },
        })),
        { ordered: false },
      );
    }
    await UserModel.updateMany(
      { institutionId: null, role: { $nin: ['ADMIN', 'PROFESSOR'] } },
      { $set: { institutionId: uts._id } },
    );
    // Cuentas de docente sin ficha, o cuya ficha sigue sin institución porque
    // no pidió ninguna: también eran de las UTS. Las que pidieron otra quedan
    // como solicitud pendiente.
    const conSolicitud = await ProfessorModel.find({
      institutionId: null,
      institucionSolicitada: { $nin: [null, ''] },
    })
      .select('userId')
      .lean();
    await UserModel.updateMany(
      { institutionId: null, role: 'PROFESSOR', _id: { $nin: conSolicitud.map(ficha => ficha.userId) } },
      { $set: { institutionId: uts._id } },
    );
    await UserModel.updateMany({ role: 'ADMIN', institutionId: { $ne: null } }, { $set: { institutionId: null } });
  }

  if (creados.length > 0 || docentesVinculados > 0) {
    console.info(
      `[instituciones] perfiles creados: ${creados.length ? creados.join(', ') : 'ninguno'}; ` +
        `docentes vinculados a UTS: ${docentesVinculados}`,
    );
  }
  return { creados, docentesVinculados };
}
