import { UserModel } from '../../models/user.model.js';
import { enviarCorreo } from '../../shared/mailer.js';
import { crearNotificacion } from '../../shared/notify.js';

/**
 * Decisión sobre una solicitud de registro → aviso a quien la envió.
 *
 * Al enviar la solicitud se le dice a la persona «te avisaremos al correo que
 * registraste», y hasta ahora eso no lo cumplía nadie: aprobar o rechazar solo
 * cambiaba el estado en la base. El docente aprobado no tenía forma de
 * enterarse salvo reintentando el login a ciegas hasta que un día funcionara, y
 * el motivo de un rechazo se quedaba escrito en un campo que nunca salía.
 *
 * El correo es el canal que importa: la cuenta todavía no ha entrado nunca, así
 * que no hay sesión abierta ni teléfono registrado al que empujar nada. La
 * notificación en la aplicación se crea igualmente para la aprobación, porque
 * es lo primero que verá al entrar y deja constancia de cuándo se le abrió.
 *
 * No lanza. Un fallo del proveedor de correo no puede tumbar la decisión que la
 * administración ya tomó y que ya está guardada.
 */

export type DecisionRegistro = 'APROBADO' | 'RECHAZADO';

export type ResultadoAvisoRegistro = {
  correo: boolean;
  notificacion: boolean;
};

const SIN_AVISO: ResultadoAvisoRegistro = { correo: false, notificacion: false };

function cuerpoAprobado(nombre: string): { asunto: string; texto: string } {
  return {
    asunto: 'Tu registro fue aprobado · UTS Nexus Académico',
    texto:
      `Hola ${nombre}:\n\n` +
      'Tu solicitud de registro fue aprobada. Ya puedes entrar a UTS Nexus ' +
      'Académico con el correo y la contraseña que registraste.\n\n' +
      'Si no reconoces esta solicitud, avisa a la administración.',
  };
}

function cuerpoRechazado(nombre: string, motivo: string): { asunto: string; texto: string } {
  return {
    asunto: 'Tu registro no fue aprobado · UTS Nexus Académico',
    texto:
      `Hola ${nombre}:\n\n` +
      'Tu solicitud de registro no fue aprobada.\n\n' +
      // El motivo es opcional: sin él el mensaje sigue siendo útil y no deja
      // una línea vacía con dos puntos colgando.
      (motivo ? `Motivo: ${motivo}\n\n` : '') +
      'Si crees que es un error, contacta con la administración.',
  };
}

/**
 * Avisa al docente de la decisión.
 *
 * @param userId Cuenta dueña de la ficha de docente.
 * @param decision Lo que la administración decidió.
 * @param motivo Texto del rechazo. Vacío en una aprobación.
 */
export async function avisarDecisionRegistro(
  userId: string,
  decision: DecisionRegistro,
  motivo = '',
): Promise<ResultadoAvisoRegistro> {
  const usuario = await UserModel.findById(userId).select('email fullName').lean();
  if (!usuario?.email) return SIN_AVISO;

  const nombre = (usuario.fullName ?? '').trim() || 'docente';
  const aprobado = decision === 'APROBADO';
  const { asunto, texto } = aprobado ? cuerpoAprobado(nombre) : cuerpoRechazado(nombre, motivo);

  let correo = false;
  try {
    correo = await enviarCorreo({ para: [usuario.email], asunto, texto });
  } catch (err) {
    console.error('[registro] no se pudo enviar el correo de la decisión:', err);
  }

  // Solo la aprobación deja notificación: al rechazado no se le abre la
  // aplicación, así que nadie la leería nunca y quedaría de adorno en la base.
  if (!aprobado) return { correo, notificacion: false };

  try {
    // La clave identifica el hecho —esta cuenta fue aprobada—, así que aprobar
    // dos veces (una reapertura, un doble clic) no duplica el aviso.
    const resultado = await crearNotificacion({
      userId: String(userId),
      title: 'Tu registro fue aprobado',
      message: 'Ya puedes usar UTS Nexus Académico con tu correo institucional.',
      type: 'SISTEMA',
      priority: 'IMPORTANT',
      dedupeKey: `registro:aprobado:${userId}`,
    });
    return { correo, notificacion: resultado.creada };
  } catch (err) {
    console.error('[registro] no se pudo crear la notificación de aprobación:', err);
    return { correo, notificacion: false };
  }
}
