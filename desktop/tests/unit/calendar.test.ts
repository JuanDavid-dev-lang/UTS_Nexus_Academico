/**
 * Cálculos del calendario. Sin React y sin servidor.
 *
 * Lo que fijan estas pruebas es que la hora que se dibuja sea la del campus y
 * no la del equipo, y que dos clases solapadas se vean las dos. Un fallo aquí
 * no rompe nada visiblemente: simplemente enseña una hora equivocada.
 */
import { describe, expect, it } from 'vitest';
import {
  aCampos,
  agruparPorFecha,
  desdeCampos,
  diasDeMes,
  diasDeSemana,
  distribuirDia,
  esHoy,
  fechaCampus,
  franjaVisible,
  horaCampus,
  inicioSemana,
  minutoDelDia,
  navegar,
  rangoDeVista,
  tiempoRestante,
  tituloDeVista,
} from '@/domain/agenda/calendar';
import type { AgendaItem } from '@/domain/schemas/agenda';

const OFFSET = -300;

function item(parcial: Partial<AgendaItem> & { id: string; startAt: string }): AgendaItem {
  return {
    origen: 'schedule',
    sourceId: parcial.id,
    kind: 'CLASS',
    type: 'CLASS',
    title: 'Clase',
    description: '',
    endAt: parcial.startAt,
    durationMinutes: 60,
    allDay: false,
    date: fechaCampus(parcial.startAt, OFFSET),
    subjectId: null,
    subjectName: '',
    subjectCode: '',
    groupId: null,
    groupName: '',
    teacherId: null,
    teacherName: '',
    classroom: '',
    modality: '',
    period: '',
    priority: 'MEDIUM',
    reminderMinutes: [],
    status: 'PROXIMA',
    editable: false,
    ...parcial,
  };
}

describe('hora del campus', () => {
  it('no usa la zona horaria del equipo', () => {
    // 15:00 UTC son las 10:00 en el campus.
    expect(horaCampus('2026-08-10T15:00:00.000Z', OFFSET)).toBe('10:00 a. m.');
    expect(horaCampus('2026-08-10T17:00:00.000Z', OFFSET)).toBe('12:00 p. m.');
    expect(horaCampus('2026-08-11T04:30:00.000Z', OFFSET)).toBe('11:30 p. m.');
  });

  it('la fecha del campus puede ser el día anterior al UTC', () => {
    expect(fechaCampus('2026-08-11T03:00:00.000Z', OFFSET)).toBe('2026-08-10');
  });

  it('el minuto del día se mide desde la medianoche del campus', () => {
    expect(minutoDelDia('2026-08-10T15:30:00.000Z', OFFSET)).toBe(10 * 60 + 30);
  });
});

describe('rangos y navegación', () => {
  const miercoles = new Date('2026-08-12T19:00:00.000Z');

  it('la semana empieza el lunes', () => {
    expect(fechaCampus(inicioSemana(miercoles, OFFSET), OFFSET)).toBe('2026-08-10');
    const dias = diasDeSemana(miercoles, OFFSET);
    expect(dias).toHaveLength(7);
    expect(fechaCampus(dias[6]!, OFFSET)).toBe('2026-08-16');
  });

  it('la rejilla del mes son 42 días y empieza en lunes', () => {
    const dias = diasDeMes(miercoles, OFFSET);
    expect(dias).toHaveLength(42);
    // Agosto de 2026 empieza en sábado; la rejilla arranca el lunes 27 de julio.
    expect(fechaCampus(dias[0]!, OFFSET)).toBe('2026-07-27');
  });

  it('el rango de la vista mensual cubre esos 42 días', () => {
    const { desde, hasta } = rangoDeVista('mes', miercoles, OFFSET);
    expect(Math.round((hasta.getTime() - desde.getTime()) / 86_400_000)).toBe(42);
  });

  it('avanzar un mes desde un día 31 no se salta ningún mes', () => {
    const treintaYUno = new Date('2026-01-31T15:00:00.000Z');
    const siguiente = navegar('mes', treintaYUno, 1, OFFSET);
    expect(fechaCampus(siguiente, OFFSET).slice(0, 7)).toBe('2026-02');
  });

  it('avanzar una semana suma siete días', () => {
    const siguiente = navegar('semana', miercoles, 1, OFFSET);
    expect(fechaCampus(siguiente, OFFSET)).toBe('2026-08-19');
  });

  it('el título describe la vista activa', () => {
    expect(tituloDeVista('dia', miercoles, OFFSET)).toBe('miércoles 12 de agosto');
    expect(tituloDeVista('semana', miercoles, OFFSET)).toBe('10 – 16 de agosto');
    expect(tituloDeVista('mes', miercoles, OFFSET)).toBe('agosto de 2026');
  });

  it('reconoce el día de hoy en hora del campus', () => {
    const ahora = new Date('2026-08-11T03:00:00.000Z'); // 22:00 del día 10
    expect(esHoy(new Date('2026-08-10T15:00:00.000Z'), OFFSET, ahora)).toBe(true);
    expect(esHoy(new Date('2026-08-11T15:00:00.000Z'), OFFSET, ahora)).toBe(false);
  });
});

describe('distribución de bloques', () => {
  it('dos clases a la misma hora se reparten en dos columnas', () => {
    const bloques = distribuirDia(
      [
        item({ id: 'a', startAt: '2026-08-10T15:00:00.000Z', durationMinutes: 60 }),
        item({ id: 'b', startAt: '2026-08-10T15:00:00.000Z', durationMinutes: 60 }),
      ],
      OFFSET,
      7,
      21,
    );

    expect(bloques).toHaveLength(2);
    expect(bloques.every((bloque) => bloque.columnas === 2)).toBe(true);
    expect(new Set(bloques.map((bloque) => bloque.columna)).size).toBe(2);
  });

  it('dos clases seguidas ocupan una sola columna cada una', () => {
    const bloques = distribuirDia(
      [
        item({ id: 'a', startAt: '2026-08-10T15:00:00.000Z', durationMinutes: 60 }),
        item({ id: 'b', startAt: '2026-08-10T16:00:00.000Z', durationMinutes: 60 }),
      ],
      OFFSET,
      7,
      21,
    );
    expect(bloques.every((bloque) => bloque.columnas === 1)).toBe(true);
  });

  it('coloca el bloque a la altura que le toca', () => {
    // Rejilla de 7 a 21 (14 h). Una clase de 10:00 empieza al 3/14 del alto.
    const [bloque] = distribuirDia(
      [item({ id: 'a', startAt: '2026-08-10T15:00:00.000Z', durationMinutes: 120 })],
      OFFSET,
      7,
      21,
    );
    expect(bloque!.top).toBeCloseTo((3 / 14) * 100, 5);
    expect(bloque!.alto).toBeCloseTo((2 / 14) * 100, 5);
  });

  it('una entrega sin duración conserva un alto tocable', () => {
    const [bloque] = distribuirDia(
      [item({ id: 'a', startAt: '2026-08-10T15:00:00.000Z', durationMinutes: 0, kind: 'ACTIVITY' })],
      OFFSET,
      7,
      21,
    );
    expect(bloque!.alto).toBeGreaterThan(0);
  });

  it('los eventos de todo el día no entran en la rejilla horaria', () => {
    const bloques = distribuirDia(
      [item({ id: 'a', startAt: '2026-08-10T05:00:00.000Z', allDay: true })],
      OFFSET,
      7,
      21,
    );
    expect(bloques).toEqual([]);
  });
});

describe('franja visible', () => {
  it('mantiene un mínimo razonable aunque solo haya una clase', () => {
    const { desdeHora, hastaHora } = franjaVisible(
      [item({ id: 'a', startAt: '2026-08-10T15:00:00.000Z', durationMinutes: 60 })],
      OFFSET,
    );
    expect(desdeHora).toBeLessThanOrEqual(6);
    expect(hastaHora).toBeGreaterThanOrEqual(20);
  });

  it('se estira para que quepa una clase temprana', () => {
    const { desdeHora } = franjaVisible(
      [item({ id: 'a', startAt: '2026-08-10T11:00:00.000Z', durationMinutes: 60 })], // 06:00
      OFFSET,
    );
    expect(desdeHora).toBe(5);
  });
});

describe('agrupación', () => {
  it('agrupa por fecha conservando el orden', () => {
    const mapa = agruparPorFecha([
      item({ id: 'a', startAt: '2026-08-10T15:00:00.000Z' }),
      item({ id: 'b', startAt: '2026-08-11T15:00:00.000Z' }),
      item({ id: 'c', startAt: '2026-08-10T17:00:00.000Z' }),
    ]);
    expect([...mapa.keys()]).toEqual(['2026-08-10', '2026-08-11']);
    expect(mapa.get('2026-08-10')?.map((entrada) => entrada.id)).toEqual(['a', 'c']);
  });
});

describe('campos de formulario', () => {
  it('interpreta la hora escrita como hora del campus', () => {
    expect(desdeCampos('2026-08-10', '10:00', OFFSET)).toBe('2026-08-10T15:00:00.000Z');
  });

  it('vuelve a los mismos campos al releer', () => {
    const iso = desdeCampos('2026-08-10', '07:30', OFFSET)!;
    expect(aCampos(iso, OFFSET)).toEqual({ fecha: '2026-08-10', hora: '07:30' });
  });

  it('rechaza lo que no es una fecha o una hora', () => {
    expect(desdeCampos('', '10:00', OFFSET)).toBeNull();
    expect(desdeCampos('2026-08-10', '', OFFSET)).toBeNull();
    expect(aCampos(null, OFFSET)).toEqual({ fecha: '', hora: '' });
  });
});

describe('tiempo restante', () => {
  it('usa la unidad que corresponde', () => {
    expect(tiempoRestante(32)).toBe('32 minutos');
    expect(tiempoRestante(1)).toBe('1 minuto');
    expect(tiempoRestante(90)).toBe('1 h 30 min');
    expect(tiempoRestante(120)).toBe('2 horas');
    expect(tiempoRestante(0)).toBe('ahora');
  });
});
