import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findById: vi.fn(),
  enviarCorreo: vi.fn(),
  crearNotificacion: vi.fn(),
}));

vi.mock('../src/models/user.model.js', () => ({
  UserModel: { findById: mocks.findById },
}));
vi.mock('../src/shared/mailer.js', () => ({ enviarCorreo: mocks.enviarCorreo }));
vi.mock('../src/shared/notify.js', () => ({ crearNotificacion: mocks.crearNotificacion }));

import { avisarDecisionRegistro } from '../src/modules/registration/registration-notify.service.js';

/** `UserModel.findById(...).select(...).lean()` en una sola línea. */
function cuenta(valor: unknown) {
  mocks.findById.mockReturnValue({ select: () => ({ lean: async () => valor }) });
}

describe('aviso de la decisión sobre un registro', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enviarCorreo.mockResolvedValue(true);
    mocks.crearNotificacion.mockResolvedValue({ creada: true, id: 'n1' });
    cuenta({ email: 'docente@uts.edu.co', fullName: 'Ana Ruiz' });
  });

  it('al aprobar manda correo y deja notificación', async () => {
    const resultado = await avisarDecisionRegistro('u1', 'APROBADO');

    expect(resultado).toEqual({ correo: true, notificacion: true });
    const mensaje = mocks.enviarCorreo.mock.calls[0]?.[0];
    expect(mensaje.para).toEqual(['docente@uts.edu.co']);
    expect(mensaje.texto).toContain('Ana Ruiz');
    expect(mocks.crearNotificacion).toHaveBeenCalledOnce();
  });

  it('la notificación de aprobación se deduplica por cuenta', () => {
    // Aprobar dos veces —un doble clic, una reapertura— es el mismo hecho.
    return avisarDecisionRegistro('u1', 'APROBADO').then(() => {
      expect(mocks.crearNotificacion.mock.calls[0]?.[0].dedupeKey).toBe('registro:aprobado:u1');
    });
  });

  it('al rechazar manda el motivo por correo y no crea notificación', async () => {
    const resultado = await avisarDecisionRegistro('u1', 'RECHAZADO', 'La cédula no coincide.');

    expect(resultado).toEqual({ correo: true, notificacion: false });
    expect(mocks.enviarCorreo.mock.calls[0]?.[0].texto).toContain('La cédula no coincide.');
    // Al rechazado no se le abre la aplicación: una notificación ahí no la lee
    // nadie nunca.
    expect(mocks.crearNotificacion).not.toHaveBeenCalled();
  });

  it('un rechazo sin motivo no deja la línea de motivo vacía', async () => {
    await avisarDecisionRegistro('u1', 'RECHAZADO');
    expect(mocks.enviarCorreo.mock.calls[0]?.[0].texto).not.toContain('Motivo:');
  });

  it('sin cuenta o sin correo no intenta nada', async () => {
    cuenta(null);
    expect(await avisarDecisionRegistro('fantasma', 'APROBADO')).toEqual({
      correo: false,
      notificacion: false,
    });
    expect(mocks.enviarCorreo).not.toHaveBeenCalled();
  });

  it('un fallo del correo no tumba la decisión ya guardada', async () => {
    mocks.enviarCorreo.mockRejectedValue(new Error('SMTP caído'));

    // No lanza: la administración ya decidió y eso está escrito en la base.
    const resultado = await avisarDecisionRegistro('u1', 'APROBADO');
    expect(resultado.correo).toBe(false);
    expect(resultado.notificacion).toBe(true);
  });

  it('un fallo de la notificación tampoco', async () => {
    mocks.crearNotificacion.mockRejectedValue(new Error('base caída'));

    const resultado = await avisarDecisionRegistro('u1', 'APROBADO');
    expect(resultado).toEqual({ correo: true, notificacion: false });
  });

  it('sin nombre en la cuenta el correo sigue siendo legible', async () => {
    cuenta({ email: 'docente@uts.edu.co', fullName: '   ' });
    await avisarDecisionRegistro('u1', 'APROBADO');
    expect(mocks.enviarCorreo.mock.calls[0]?.[0].texto).toContain('Hola docente:');
  });
});
