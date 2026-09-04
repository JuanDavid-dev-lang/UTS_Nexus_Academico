import { InstitutionModel } from '../models/institution.model.js';
import { ProfessorModel } from '../models/professor.model.js';
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
  }

  if (creados.length > 0 || docentesVinculados > 0) {
    console.info(
      `[instituciones] perfiles creados: ${creados.length ? creados.join(', ') : 'ninguno'}; ` +
        `docentes vinculados a UTS: ${docentesVinculados}`,
    );
  }
  return { creados, docentesVinculados };
}
