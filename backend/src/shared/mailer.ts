import nodemailer, { type Transporter } from 'nodemailer';
import { env } from './env.js';

/**
 * Correo saliente.
 *
 * Degrada como el servicio ML: sin `SMTP_HOST` no se envía nada y se deja
 * constancia en el log, en vez de reventar. Una instalación local no debería
 * tener que configurar un servidor de correo para poder arrancar, y un fallo de
 * correo nunca debe tumbar la operación que lo disparó — avisar de algo es
 * secundario respecto a que ese algo haya ocurrido.
 */

let transporte: Transporter | null = null;

export function correoActivo(): boolean {
  return Boolean(env.SMTP_HOST);
}

function obtenerTransporte(): Transporter | null {
  if (!correoActivo()) return null;
  transporte ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    ...(env.SMTP_USER ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASS } } : {}),
  });
  return transporte;
}

export type Mensaje = {
  para: string[];
  asunto: string;
  texto: string;
  html?: string;
};

/**
 * Envía un mensaje a varios destinatarios.
 *
 * Los destinatarios van en `bcc` y nunca en `to`: son docentes de la misma
 * institución y un aviso masivo con todas las direcciones a la vista filtra el
 * correo de cada uno al resto. El `to` es el propio remitente, que es lo que
 * espera un servidor SMTP cuando el reparto es oculto.
 *
 * Devuelve si se envió. No lanza: quien avisa no debe caerse porque el correo
 * falle.
 */
export async function enviarCorreo(mensaje: Mensaje): Promise<boolean> {
  const cliente = obtenerTransporte();
  if (!cliente) {
    console.info(`[correo] desactivado (sin SMTP_HOST); no se envía «${mensaje.asunto}».`);
    return false;
  }
  if (mensaje.para.length === 0) return false;

  try {
    await cliente.sendMail({
      from: env.SMTP_FROM,
      to: env.SMTP_FROM,
      bcc: mensaje.para,
      subject: mensaje.asunto,
      text: mensaje.texto,
      ...(mensaje.html ? { html: mensaje.html } : {}),
    });
    return true;
  } catch (error) {
    console.error('[correo] no se pudo enviar:', error);
    return false;
  }
}
