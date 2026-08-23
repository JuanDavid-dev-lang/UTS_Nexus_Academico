import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  scheduleFind: vi.fn(),
  eventFind: vi.fn(),
  professorFind: vi.fn(),
  subjectFind: vi.fn(),
  groupFind: vi.fn(),
  crear: vi.fn(),
  preferencias: vi.fn(),
}));

function consulta(resultado: unknown) {
  const cadena: any = {
    select: vi.fn(() => cadena),
    lean: vi.fn(async () => resultado),
  };
  return cadena;
}

vi.mock('../src/models/schedule.model.js', () => ({ ScheduleModel: { find: mocks.scheduleFind } }));
vi.mock('../src/models/calendar-event.model.js', () => ({
  CalendarEventModel: { find: mocks.eventFind },
}));
vi.mock('../src/models/professor.model.js', () => ({
  ProfessorModel: { find: mocks.professorFind },
}));
vi.mock('../src/models/subject.model.js', () => ({ SubjectModel: { find: mocks.subjectFind } }));
vi.mock('../src/models/group.model.js', () => ({ GroupModel: { find: mocks.groupFind } }));
vi.mock('../src/shared/notify.js', () => ({
  crearNotificacion: mocks.crear,
  obtenerPreferencias: mocks.preferencias,
}));

import { generarRecordatorios } from '../src/modules/notifications/class-reminder.service.js';

const AHORA = new Date('2026-08-23T12:00:00.000Z');
/** Justo un día después: cae en la ventana de la antelación institucional. */
const MANANA = new Date('2026-08-24T12:00:00.000Z');

describe('recordatorios del calendario institucional', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.scheduleFind.mockImplementation(() => consulta([]));
    mocks.subjectFind.mockImplementation(() => consulta([]));
    mocks.groupFind.mockImplementation(() => consulta([]));
    mocks.professorFind.mockImplementation(() =>
      consulta([{ userId: 'docente-a' }, { userId: 'docente-b' }]),
    );
    mocks.crear.mockResolvedValue({ creada: true, omitida: null, id: 'n1', push: null });
    mocks.preferencias.mockResolvedValue({
      clases: true,
      evaluaciones: true,
      eventos: true,
      recordatorios: true,
      classLeadMinutes: [15],
      quietHours: { enabled: false, start: '21:00', end: '06:00' },
    });
  });

  /*
   * El importador crea los eventos institucionales con `teacherId: null` y
   * `reminderMinutes: []`. Antes quedaban fuera dos veces —la consulta no los
   * traía y el bucle descartaba lo que no tuviera dueño—, así que se podía
   * importar el calendario académico entero sin que avisara a una sola persona.
   */
  it('avisa a todos los docentes de un evento sin dueño ni antelación propia', async () => {
    mocks.eventFind.mockImplementation(() =>
      consulta([
        {
          _id: 'evento-1',
          title: 'Cierre del segundo corte',
          type: 'ACADEMIC',
          startAt: MANANA,
          teacherId: null,
          subjectId: null,
          reminderMinutes: [],
          priority: 'MEDIUM',
          visibility: 'INSTITUTIONAL',
        },
      ]),
    );

    const resultado = await generarRecordatorios(AHORA, 5);

    expect(resultado.avisos).toBe(2);
    expect(mocks.crear).toHaveBeenCalledTimes(2);
    expect(mocks.crear.mock.calls.map(([entrada]) => entrada.userId)).toEqual([
      'docente-a',
      'docente-b',
    ]);
    expect(mocks.crear.mock.calls[0][0]).toMatchObject({
      type: 'EVENT',
      dedupeKey: 'event:evento-1:1440',
    });
  });

  /*
   * La consulta de docentes se resuelve una vez por pasada. Con veinte fechas
   * institucionales importadas de golpe, una consulta por evento serían veinte
   * viajes para la misma respuesta.
   */
  it('resuelve la lista de docentes una sola vez por pasada', async () => {
    mocks.eventFind.mockImplementation(() =>
      consulta([
        {
          _id: 'evento-1', title: 'Cierre', type: 'ACADEMIC', startAt: MANANA,
          teacherId: null, subjectId: null, reminderMinutes: [], priority: 'MEDIUM',
          visibility: 'INSTITUTIONAL',
        },
        {
          _id: 'evento-2', title: 'Inicio de parciales', type: 'ACADEMIC', startAt: MANANA,
          teacherId: null, subjectId: null, reminderMinutes: [], priority: 'MEDIUM',
          visibility: 'INSTITUTIONAL',
        },
      ]),
    );

    await generarRecordatorios(AHORA, 5);

    expect(mocks.professorFind).toHaveBeenCalledTimes(1);
    expect(mocks.crear).toHaveBeenCalledTimes(4);
  });

  it('un evento personal sigue avisando solo a su dueño', async () => {
    mocks.eventFind.mockImplementation(() =>
      consulta([
        {
          _id: 'evento-3', title: 'Tutoría', type: 'TUTORING', startAt: MANANA,
          teacherId: 'docente-a', subjectId: null, reminderMinutes: [1440],
          priority: 'MEDIUM', visibility: 'PERSONAL',
        },
      ]),
    );

    const resultado = await generarRecordatorios(AHORA, 5);

    expect(resultado.avisos).toBe(1);
    expect(mocks.crear.mock.calls[0][0].userId).toBe('docente-a');
    // No hace falta la lista institucional para un evento con dueño.
    expect(mocks.professorFind).not.toHaveBeenCalled();
  });

  it('respeta la antelación declarada en vez de la institucional por defecto', async () => {
    mocks.eventFind.mockImplementation(() =>
      consulta([
        {
          _id: 'evento-4', title: 'Grados', type: 'ACADEMIC', startAt: MANANA,
          teacherId: null, subjectId: null, reminderMinutes: [1440],
          priority: 'HIGH', visibility: 'INSTITUTIONAL',
        },
      ]),
    );

    await generarRecordatorios(AHORA, 5);

    expect(mocks.crear.mock.calls[0][0]).toMatchObject({
      dedupeKey: 'event:evento-4:1440',
      priority: 'IMPORTANT',
    });
  });

  it('un docente que apagó los eventos no recibe el institucional', async () => {
    mocks.preferencias.mockResolvedValue({
      clases: true, evaluaciones: true, eventos: false, recordatorios: true,
      classLeadMinutes: [15],
      quietHours: { enabled: false, start: '21:00', end: '06:00' },
    });
    mocks.eventFind.mockImplementation(() =>
      consulta([
        {
          _id: 'evento-5', title: 'Cierre', type: 'ACADEMIC', startAt: MANANA,
          teacherId: null, subjectId: null, reminderMinutes: [], priority: 'MEDIUM',
          visibility: 'INSTITUTIONAL',
        },
      ]),
    );

    const resultado = await generarRecordatorios(AHORA, 5);

    expect(resultado.avisos).toBe(0);
    expect(mocks.crear).not.toHaveBeenCalled();
  });

  it('la consulta pide institucionales además de los que traen antelación', async () => {
    mocks.eventFind.mockImplementation(() => consulta([]));

    await generarRecordatorios(AHORA, 5);

    expect(mocks.eventFind.mock.calls[0][0].$or).toEqual([
      { reminderMinutes: { $exists: true, $ne: [] } },
      { visibility: 'INSTITUTIONAL' },
    ]);
  });
});
