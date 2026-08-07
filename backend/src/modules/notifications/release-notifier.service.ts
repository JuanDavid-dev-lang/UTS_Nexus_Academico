import { ConfigModel } from '../../models/config.model.js';
import { UserModel } from '../../models/user.model.js';
import { ProfessorModel } from '../../models/professor.model.js';
import { NotificationModel } from '../../models/notification.model.js';
import { env } from '../../shared/env.js';
import { enviarCorreo } from '../../shared/mailer.js';
import { emitToUsers } from '../../shared/socket.js';

/**
 * Aviso de versión nueva.
 *
 * El backend consulta el repositorio público de instaladores en vez de esperar
 * a que el workflow de publicación le llame. Es lo que funciona en este montaje:
 * el servidor puede estar en una red donde GitHub Actions no llega, y el
 * repositorio de releases es público, así que consultarlo no necesita
 * credenciales. Además cubre las publicaciones hechas a mano.
 *
 * La versión ya avisada se guarda en Configuración: sin ese ancla, cada reinicio
 * del proceso volvería a anunciar la misma versión a todo el claustro.
 */

const CLAVE_ULTIMA_VERSION = 'ultima_version_avisada';

type Publicacion = {
  tag_name?: string;
  name?: string;
  body?: string;
  html_url?: string;
};

async function consultarUltimaPublicacion(): Promise<Publicacion | null> {
  try {
    const respuesta = await fetch(
      `https://api.github.com/repos/${env.RELEASES_REPO}/releases/latest`,
      {
        headers: { Accept: 'application/vnd.github+json' },
        signal: AbortSignal.timeout(10_000),
      }
    );
    if (!respuesta.ok) return null;
    return (await respuesta.json()) as Publicacion;
  } catch {
    // Sin red o GitHub caído: no es un error del que informar al docente.
    return null;
  }
}

export type ResultadoAvisoVersion = {
  version: string | null;
  avisados: number;
  correoEnviado: boolean;
  /** true si no había nada nuevo que anunciar. */
  sinCambios: boolean;
};

export async function notificarVersionNueva(): Promise<ResultadoAvisoVersion> {
  const publicacion = await consultarUltimaPublicacion();
  const version = publicacion?.tag_name?.trim();
  if (!version) {
    return { version: null, avisados: 0, correoEnviado: false, sinCambios: true };
  }

  const guardada = await ConfigModel.findOne({ key: CLAVE_ULTIMA_VERSION }).lean();
  if (guardada?.value === version) {
    return { version, avisados: 0, correoEnviado: false, sinCambios: true };
  }

  /*
   * Solo docentes aprobados. Una cuenta PENDIENTE todavía no ha sido revisada
   * por la administración: mandarle correo institucional sería tratarla como
   * miembro del claustro antes de que alguien lo confirme.
   */
  const fichas = await ProfessorModel.find({ deletedAt: null, estado: 'APROBADO' })
    .select('userId')
    .lean();
  const userIds = fichas.map(ficha => String(ficha.userId));

  const usuarios = await UserModel.find({ _id: { $in: userIds }, deletedAt: null })
    .select('email fullName')
    .lean();

  const titulo = `Nueva versión disponible: ${publicacion?.name ?? version}`;
  const cuerpo =
    (publicacion?.body?.trim() || 'Hay una versión nueva de UTS Nexus Académico.') +
    (publicacion?.html_url ? `\n\nDescárgala en: ${publicacion.html_url}` : '');

  // Primero el aviso dentro de la aplicación: no depende de que haya SMTP, y es
  // el que verá quien tenga la aplicación abierta ahora mismo.
  if (usuarios.length > 0) {
    await NotificationModel.insertMany(
      usuarios.map(usuario => ({
        userId: usuario._id,
        title: titulo,
        message: cuerpo,
        type: 'SISTEMA',
        metadata: { version, url: publicacion?.html_url ?? null },
      })),
      { ordered: false }
    );
    emitToUsers(userIds, 'sync:update', {
      entity: 'notification',
      action: 'create',
      id: version,
    });
  }

  const correoEnviado = await enviarCorreo({
    para: usuarios.map(usuario => usuario.email).filter(Boolean),
    asunto: titulo,
    texto: cuerpo,
  });

  /*
   * La marca se guarda pase lo que pase con el correo. Si se guardara solo
   * cuando el envío funciona, un SMTP mal configurado —o simplemente ausente—
   * reintentaría el anuncio en cada ciclo y llenaría de notificaciones repetidas
   * a todo el claustro.
   */
  await ConfigModel.findOneAndUpdate(
    { key: CLAVE_ULTIMA_VERSION },
    { $set: { key: CLAVE_ULTIMA_VERSION, value: version } },
    { upsert: true }
  );

  return { version, avisados: usuarios.length, correoEnviado, sinCambios: false };
}
