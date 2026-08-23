import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  professorFind: vi.fn(),
  announcementFind: vi.fn(),
  announcementUpdateOne: vi.fn(),
  crear: vi.fn(),
}));

function consulta(resultado: unknown) {
  const cadena: any = {
    select: vi.fn(() => cadena),
    limit: vi.fn(() => cadena),
    lean: vi.fn(async () => resultado),
    then: undefined as any,
  };
  return cadena;
}

vi.mock('../src/models/professor.model.js', () => ({
  ProfessorModel: { find: mocks.professorFind },
}));
vi.mock('../src/shared/notify.js', () => ({ crearNotificacion: mocks.crear }));
vi.mock('../src/models/announcement.model.js', () => ({
  AnnouncementModel: { find: mocks.announcementFind, findOneAndUpdate: mocks.announcementUpdateOne },
}));

import {
  notificarAviso,
  repartirAvisosPendientes,
  resumirCuerpo,
  type AvisoNotificable,
} from '../src/modules/announcements/announcement-notify.service.js';

const AHORA = new Date('2026-08-23T15:00:00.000Z');

function aviso(extra: Partial<AvisoNotificable> = {}): AvisoNotificable {
  return {
    id: 'aviso-1',
    titulo: 'Cambio de fechas',
    cuerpo: 'La entrega del segundo corte se aplaza una semana.',
    tipo: 'INFORMATIVO',
    autorId: 'admin-1',
    sedes: [],
    facultades: [],
    programas: [],
    publicadoEn: new Date('2026-08-23T14:00:00.000Z'),
    expiraEn: null,
    ...extra,
  };
}

describe('reparto de avisos institucionales', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.professorFind.mockImplementation(() =>
      consulta([{ userId: 'docente-a' }, { userId: 'docente-b' }]),
    );
    mocks.crear.mockResolvedValue({ creada: true, omitida: null, id: 'n1', push: null });
  });

  it('notifica a cada docente del alcance', async () => {
    const resultado = await notificarAviso(aviso(), AHORA);

    expect(resultado).toEqual({ notificados: 2, omitidos: 0, motivo: null });
    expect(mocks.crear).toHaveBeenCalledTimes(2);
    expect(mocks.crear.mock.calls[0][0]).toMatchObject({
      userId: 'docente-a',
      type: 'AVISO',
      priority: 'INFO',
      link: '/avisos',
      dedupeKey: 'aviso:aviso-1',
    });
  });

  it('no le cuenta el aviso a quien lo escribió', async () => {
    mocks.professorFind.mockImplementation(() =>
      consulta([{ userId: 'docente-a' }, { userId: 'admin-1' }]),
    );

    const resultado = await notificarAviso(aviso({ autorId: 'admin-1' }), AHORA);

    expect(resultado.notificados).toBe(1);
    expect(mocks.crear).toHaveBeenCalledTimes(1);
    expect(mocks.crear.mock.calls[0][0].userId).toBe('docente-a');
  });

  it('un aviso urgente se reparte con prioridad urgente', async () => {
    await notificarAviso(aviso({ tipo: 'URGENTE' }), AHORA);
    expect(mocks.crear.mock.calls[0][0].priority).toBe('URGENT');
  });

  /*
   * Un aviso con fecha futura todavía no aparece en la lista de nadie.
   * Notificarlo al crearlo adelantaría su contenido, que es justo lo que
   * programar una publicación intenta evitar.
   */
  it('un aviso programado no se reparte todavía', async () => {
    const resultado = await notificarAviso(
      aviso({ publicadoEn: new Date('2026-09-01T08:00:00.000Z') }),
      AHORA,
    );

    expect(resultado).toEqual({ notificados: 0, omitidos: 0, motivo: 'programado' });
    expect(mocks.crear).not.toHaveBeenCalled();
  });

  it('un aviso ya caducado no se reparte', async () => {
    const resultado = await notificarAviso(
      aviso({ expiraEn: new Date('2026-08-20T08:00:00.000Z') }),
      AHORA,
    );

    expect(resultado.motivo).toBe('caducado');
    expect(mocks.crear).not.toHaveBeenCalled();
  });

  it('el alcance vacío no acota, y cada criterio presente sí', async () => {
    await notificarAviso(aviso(), AHORA);
    expect(mocks.professorFind.mock.calls[0][0]).toEqual({
      deletedAt: null,
      estado: { $nin: ['PENDIENTE', 'RECHAZADO'] },
    });

    vi.clearAllMocks();
    mocks.professorFind.mockImplementation(() => consulta([]));
    await notificarAviso(aviso({ sedes: ['BUCARAMANGA'], facultades: ['INGENIERIAS'] }), AHORA);
    expect(mocks.professorFind.mock.calls[0][0]).toMatchObject({
      sede: { $in: ['BUCARAMANGA'] },
      facultad: { $in: ['INGENIERIAS'] },
    });
  });

  /*
   * `crearNotificacion` falla para una persona —token muerto, escritura
   * rechazada— y el reparto tiene que seguir. Cortar en el primer fallo dejaría
   * sin aviso a todos los que vinieran detrás en la lista.
   */
  it('un fallo con un docente no detiene al resto', async () => {
    mocks.crear
      .mockRejectedValueOnce(new Error('sin conexión'))
      .mockResolvedValueOnce({ creada: true, omitida: null, id: 'n2', push: null });

    const resultado = await notificarAviso(aviso(), AHORA);

    expect(resultado).toEqual({ notificados: 1, omitidos: 1, motivo: null });
  });

  it('cuenta como omitido lo que las preferencias silenciaron', async () => {
    mocks.crear.mockResolvedValue({ creada: false, omitida: 'preferencia', id: null, push: null });
    const resultado = await notificarAviso(aviso(), AHORA);
    expect(resultado).toEqual({ notificados: 0, omitidos: 2, motivo: null });
  });
});

describe('resumen del cuerpo', () => {
  it('deja intacto lo que ya cabe', () => {
    expect(resumirCuerpo('Aviso corto.')).toBe('Aviso corto.');
  });

  it('colapsa los espacios y saltos de línea', () => {
    expect(resumirCuerpo('Primera línea.\n\n  Segunda   línea.')).toBe(
      'Primera línea. Segunda línea.',
    );
  });

  it('corta por palabra y no a mitad de una', () => {
    const largo = 'palabra '.repeat(40);
    const resumen = resumirCuerpo(largo, 20);

    expect(resumen.endsWith('…')).toBe(true);
    expect(resumen.length).toBeLessThanOrEqual(21);
    expect(resumen).not.toContain('palab…');
  });
});

describe('reparto de avisos programados', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.professorFind.mockImplementation(() => consulta([{ userId: 'docente-a' }]));
    mocks.crear.mockResolvedValue({ creada: true, omitida: null, id: 'n1', push: null });
  });

  it('reparte el aviso cuya fecha ya llegó y lo marca', async () => {
    mocks.announcementFind.mockImplementation(() =>
      consulta([
        {
          _id: 'aviso-9',
          titulo: 'Cierre de notas',
          cuerpo: 'El corte cierra el viernes.',
          tipo: 'IMPORTANTE',
          autorId: 'admin-1',
          sedes: [],
          facultades: [],
          programas: [],
          publicadoEn: new Date('2026-08-23T09:00:00.000Z'),
          expiraEn: null,
        },
      ]),
    );
    mocks.announcementUpdateOne.mockImplementation(() => consulta({ _id: 'aviso-9' }));

    const resultado = await repartirAvisosPendientes(AHORA);

    expect(resultado).toEqual({ avisos: 1, notificados: 1 });
    expect(mocks.announcementFind.mock.calls[0][0]).toMatchObject({
      notificadoEn: null,
      publicadoEn: { $lte: AHORA },
    });
  });

  /*
   * Con dos instancias del backend, las dos encuentran el mismo aviso. La
   * escritura condicional sobre `notificadoEn: null` solo la gana una; la otra
   * no encuentra documento y no reparte. Sin esto, un aviso a toda la
   * institución llegaría por duplicado.
   */
  it('si otra instancia lo reclamó primero, no se reparte', async () => {
    mocks.announcementFind.mockImplementation(() =>
      consulta([
        {
          _id: 'aviso-9',
          titulo: 'Cierre',
          cuerpo: 'Texto.',
          tipo: 'INFORMATIVO',
          autorId: null,
          sedes: [],
          facultades: [],
          programas: [],
          publicadoEn: new Date('2026-08-23T09:00:00.000Z'),
          expiraEn: null,
        },
      ]),
    );
    mocks.announcementUpdateOne.mockImplementation(() => consulta(null));

    const resultado = await repartirAvisosPendientes(AHORA);

    expect(resultado).toEqual({ avisos: 0, notificados: 0 });
    expect(mocks.crear).not.toHaveBeenCalled();
  });

  it('sin pendientes no toca nada', async () => {
    mocks.announcementFind.mockImplementation(() => consulta([]));
    const resultado = await repartirAvisosPendientes(AHORA);
    expect(resultado).toEqual({ avisos: 0, notificados: 0 });
    expect(mocks.announcementUpdateOne).not.toHaveBeenCalled();
  });
});
