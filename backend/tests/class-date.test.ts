import { describe, expect, it } from 'vitest';
import {
  diaDeCampus,
  diaDeClase,
  instanteDeClase,
  normalizarFechaDeClase,
  planearMigracionDeFechas,
  type RegistroParaMigrar,
} from '../src/domains/attendance/class-date.js';

/**
 * La misma clase tiene que ser siempre el mismo documento.
 *
 * El índice único de Asistencia incluye `date`: dos instantes para un mismo día
 * son dos clases y el porcentaje del estudiante cuenta ese día dos veces. Ningún
 * cliente lo enseña —todos pintan `slice(0, 10)`—, así que se fija aquí.
 */
const COLOMBIA = -300;

describe('fecha canónica de una clase', () => {
  it('se guarda como el mediodía del campus', () => {
    expect(instanteDeClase('2026-09-13', COLOMBIA).toISOString()).toBe('2026-09-13T17:00:00.000Z');
  });

  it('coincide con lo que ya guardaba el escritorio en Colombia', () => {
    // `new Date('2026-09-13T12:00:00').toISOString()` en un equipo a UTC−5.
    const escritorio = '2026-09-13T17:00:00.000Z';
    expect(normalizarFechaDeClase(escritorio, COLOMBIA)?.toISOString()).toBe(escritorio);
  });

  it('las cuatro formas de decir el mismo día dan el mismo instante', () => {
    const esperado = '2026-09-13T17:00:00.000Z';
    const formas = [
      '2026-09-13T17:00:00.000Z', // escritorio
      '2026-09-13T00:00:00.000', // móvil: medianoche sin zona
      '2026-09-13', // planilla escaneada
      new Date('2026-09-13'), // la planilla después de `z.coerce.date()`
    ];
    for (const forma of formas) {
      expect(normalizarFechaDeClase(forma, COLOMBIA)?.toISOString(), String(forma)).toBe(esperado);
    }
  });

  it('una fecha sin zona se lee como hora del campus, no del servidor', () => {
    // Una clase a las 7 de la mañana: en un servidor en UTC, `new Date()` la
    // habría dejado en el mismo día solo por casualidad; a las 22 h no.
    expect(diaDeClase('2026-09-13T22:30:00', COLOMBIA)).toBe('2026-09-13');
    expect(diaDeClase('2026-09-13T07:00', COLOMBIA)).toBe('2026-09-13');
  });

  it('un instante real cuenta el día del campus en que cae', () => {
    // Las 8 de la noche en Colombia ya son el día siguiente en UTC.
    expect(diaDeClase('2026-09-14T01:00:00.000Z', COLOMBIA)).toBe('2026-09-13');
    expect(diaDeClase('2026-09-13T20:00:00-05:00', COLOMBIA)).toBe('2026-09-13');
    expect(diaDeCampus(new Date('2026-09-14T04:59:00.000Z'), COLOMBIA)).toBe('2026-09-13');
    expect(diaDeCampus(new Date('2026-09-14T05:00:00.000Z'), COLOMBIA)).toBe('2026-09-14');
  });

  it('la medianoche UTC exacta es una fecha sin hora, no las 7 de la tarde del día anterior', () => {
    expect(diaDeClase('2026-09-13T00:00:00.000Z', COLOMBIA)).toBe('2026-09-13');
  });

  it('rechaza lo que no es un día real o es ambiguo', () => {
    for (const malo of ['2026-02-31', '13/09/2026', '09/13/2026', 'mañana', '', null, 42, {}]) {
      expect(normalizarFechaDeClase(malo, COLOMBIA), String(malo)).toBeNull();
    }
    expect(normalizarFechaDeClase(new Date('no es fecha'), COLOMBIA)).toBeNull();
  });

  it('el día guardado sigue siendo el mismo al leerlo con slice, en cualquier desfase razonable', () => {
    for (const offset of [-600, -300, 0, 60, 330, 600]) {
      expect(instanteDeClase('2026-03-01', offset).toISOString().slice(0, 10)).toBe('2026-03-01');
    }
  });
});

describe('migración de lo guardado antes', () => {
  const registro = (parcial: Partial<RegistroParaMigrar> & { id: string; date: string }): RegistroParaMigrar => ({
    studentId: 'est',
    subjectId: 'mat',
    updatedAt: null,
    deletedAt: null,
    ...parcial,
    date: new Date(parcial.date),
  });

  it('el mismo día guardado desde el escritorio y el móvil deja uno solo', () => {
    const plan = planearMigracionDeFechas(
      [
        // Escritorio, marcado el lunes a las 8: presente.
        registro({ id: 'a', date: '2026-09-14T17:00:00.000Z', updatedAt: new Date('2026-09-14T13:00:00Z') }),
        // Móvil, corregido después a las 9: ausente. Es la última decisión.
        registro({ id: 'b', date: '2026-09-14T05:00:00.000Z', updatedAt: new Date('2026-09-14T14:00:00Z') }),
      ],
      COLOMBIA,
    );
    expect(plan.clasesDuplicadas).toBe(1);
    expect(plan.borrar).toEqual([{ id: 'a', conservado: 'b' }]);
    expect(plan.normalizar.map((n) => [n.id, n.date.toISOString()])).toEqual([
      ['b', '2026-09-14T17:00:00.000Z'],
    ]);
  });

  it('un registro solo, con fecha vieja, se normaliza sin borrar nada', () => {
    const plan = planearMigracionDeFechas([registro({ id: 'a', date: '2026-09-14T00:00:00.000Z' })], COLOMBIA);
    expect(plan.borrar).toEqual([]);
    expect(plan.normalizar.map((n) => n.date.toISOString())).toEqual(['2026-09-14T17:00:00.000Z']);
  });

  it('lo vivo manda sobre lo borrado aunque sea más viejo', () => {
    const plan = planearMigracionDeFechas(
      [
        registro({ id: 'vivo', date: '2026-09-14T17:00:00.000Z', updatedAt: new Date('2026-09-14T13:00:00Z') }),
        registro({
          id: 'borrado',
          date: '2026-09-14T05:00:00.000Z',
          updatedAt: new Date('2026-09-20T00:00:00Z'),
          deletedAt: new Date('2026-09-20T00:00:00Z'),
        }),
      ],
      COLOMBIA,
    );
    expect(plan.borrar).toEqual([{ id: 'borrado', conservado: 'vivo' }]);
    expect(plan.normalizar).toEqual([]);
  });

  it('la ausencia automática del QR no gana al presente puesto a mano, aunque sea más reciente', () => {
    // Entre desplegar y migrar: el docente marcó presente con la fecha vieja y
    // después el cierre de una lista por QR escribió ausente en la canónica.
    const plan = planearMigracionDeFechas(
      [
        registro({ id: 'manual', date: '2026-09-14T05:00:00.000Z', updatedAt: new Date('2026-09-14T13:00:00Z'), present: true }),
        registro({
          id: 'relleno',
          date: '2026-09-14T17:00:00.000Z',
          updatedAt: new Date('2026-09-14T15:00:00Z'),
          present: false,
          origen: 'QR',
        }),
      ],
      COLOMBIA,
    );
    expect(plan.borrar).toEqual([{ id: 'relleno', conservado: 'manual' }]);
    expect(plan.normalizar.map((n) => n.id)).toEqual(['manual']);
  });

  it('días distintos, estudiantes distintos o materias distintas no se juntan', () => {
    const plan = planearMigracionDeFechas(
      [
        registro({ id: 'a', date: '2026-09-14T17:00:00.000Z' }),
        registro({ id: 'b', date: '2026-09-15T17:00:00.000Z' }),
        registro({ id: 'c', date: '2026-09-14T17:00:00.000Z', studentId: 'otro' }),
        registro({ id: 'd', date: '2026-09-14T17:00:00.000Z', subjectId: 'otra' }),
      ],
      COLOMBIA,
    );
    expect(plan.borrar).toEqual([]);
    expect(plan.clasesDuplicadas).toBe(0);
  });

  it('sobre datos ya migrados el plan está vacío', () => {
    const plan = planearMigracionDeFechas(
      [registro({ id: 'a', date: '2026-09-14T17:00:00.000Z' }), registro({ id: 'b', date: '2026-09-15T17:00:00.000Z' })],
      COLOMBIA,
    );
    expect(plan).toEqual({ normalizar: [], borrar: [], clasesDuplicadas: 0, sinDia: [] });
  });

  it('empatados, el resultado no depende del orden de lectura', () => {
    const a = registro({ id: 'a', date: '2026-09-14T05:00:00.000Z' });
    const b = registro({ id: 'b', date: '2026-09-14T17:00:00.000Z' });
    expect(planearMigracionDeFechas([a, b], COLOMBIA)).toEqual(planearMigracionDeFechas([b, a], COLOMBIA));
    // Se queda el que ya tiene la fecha canónica: no hay que tocarlo.
    expect(planearMigracionDeFechas([a, b], COLOMBIA).borrar).toEqual([{ id: 'a', conservado: 'b' }]);
  });
});

