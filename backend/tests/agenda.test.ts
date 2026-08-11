/**
 * Motor de agenda: funciones puras, sin base de datos ni servidor.
 *
 * Fija lo que no puede cambiar en silencio: que "10:00" son las diez del
 * campus y no las del reloj del servidor, que una clase en curso se distingue
 * de una que ya terminó, y que un recordatorio cae en UNA sola pasada del
 * temporizador. Un cambio en cualquiera de las tres rompe una prueba en vez de
 * mandar a un docente a un aula equivocada.
 */
import { describe, expect, it } from 'vitest';
import {
  ANTELACIONES_VALIDAS,
  avisoEnVentana,
  claseEnCurso,
  dentroDeFranja,
  diaLocal,
  duracionEfectiva,
  estadoDeClase,
  expandirFranjas,
  inicioDiaLocal,
  inicioSemanaLocal,
  instanteLocal,
  minutoDelDiaLocal,
  minutosDesdeMedianoche,
  minutosHasta,
  normalizarAntelaciones,
  proximaClase,
} from '../src/domains/agenda/agenda.service.js';
import {
  coincideMateria,
  detectarIntencionAgenda,
  horaCampus,
  pareceDeAgenda,
  tiempoRestante,
} from '../src/domains/agenda/agenda-questions.js';

/** Colombia: UTC-5 todo el año. */
const OFFSET = -300;

describe('lectura de horas', () => {
  it('convierte HH:mm a minutos', () => {
    expect(minutosDesdeMedianoche('00:00')).toBe(0);
    expect(minutosDesdeMedianoche('10:30')).toBe(630);
    expect(minutosDesdeMedianoche('23:59')).toBe(1439);
  });

  it('rechaza lo que no es una hora', () => {
    expect(minutosDesdeMedianoche('24:00')).toBeNull();
    expect(minutosDesdeMedianoche('10:60')).toBeNull();
    expect(minutosDesdeMedianoche('mañana')).toBeNull();
    expect(minutosDesdeMedianoche(undefined)).toBeNull();
  });
});

describe('día del campus', () => {
  it('no usa la zona horaria del proceso', () => {
    // 03:00 UTC del martes son todavía las 22:00 del lunes en el campus.
    const instante = new Date('2026-08-11T03:00:00.000Z');
    const local = diaLocal(instante, OFFSET);
    expect(local.fecha).toBe('2026-08-10');
    expect(local.diaSemana).toBe(1); // lunes
  });

  it('reconstruye el instante UTC de una hora de pared', () => {
    const instante = instanteLocal(2026, 8, 10, 10 * 60, OFFSET);
    expect(instante.toISOString()).toBe('2026-08-10T15:00:00.000Z');
  });

  it('la semana empieza en lunes', () => {
    // Miércoles 12 de agosto de 2026, 14:00 del campus.
    const miercoles = new Date('2026-08-12T19:00:00.000Z');
    expect(diaLocal(inicioSemanaLocal(miercoles, OFFSET), OFFSET).fecha).toBe('2026-08-10');
    expect(diaLocal(inicioDiaLocal(miercoles, OFFSET), OFFSET).fecha).toBe('2026-08-12');
  });
});

describe('duración efectiva', () => {
  it('prefiere endTime cuando es coherente', () => {
    expect(duracionEfectiva({ id: 'a', dayOfWeek: 1, startTime: '10:00', endTime: '12:00' })).toBe(120);
  });

  it('cae a durationMinutes si endTime es anterior o falta', () => {
    expect(duracionEfectiva({ id: 'a', dayOfWeek: 1, startTime: '10:00', endTime: '09:00', durationMinutes: 45 })).toBe(45);
    expect(duracionEfectiva({ id: 'a', dayOfWeek: 1, startTime: '10:00', durationMinutes: 60 })).toBe(60);
  });

  it('nunca devuelve cero: una clase de duración nula no se vería ni avisaría', () => {
    expect(duracionEfectiva({ id: 'a', dayOfWeek: 1, startTime: '10:00', durationMinutes: 0 })).toBe(90);
  });
});

describe('expansión del horario semanal', () => {
  const franjas = [
    { id: 'prog2', dayOfWeek: 1, startTime: '10:00', endTime: '12:00' },
    { id: 'calc1', dayOfWeek: 3, startTime: '07:00', endTime: '09:00' },
  ];

  it('genera una ocurrencia por semana y día, en hora del campus', () => {
    const desde = new Date('2026-08-10T00:00:00.000Z');
    const hasta = new Date('2026-08-17T00:00:00.000Z');
    const ocurrencias = expandirFranjas(franjas, desde, hasta, OFFSET);

    // Ordenadas por hora de inicio, no por el orden en que llegaron las franjas.
    expect(ocurrencias.map(o => o.id)).toEqual(['class:prog2:2026-08-10', 'class:calc1:2026-08-12']);
    // La del lunes 10 empieza a las 10:00 del campus = 15:00 UTC.
    const prog = ocurrencias.find(o => o.franjaId === 'prog2')!;
    expect(prog.startAt.toISOString()).toBe('2026-08-10T15:00:00.000Z');
    expect(prog.endAt.toISOString()).toBe('2026-08-10T17:00:00.000Z');
    expect(prog.durationMinutes).toBe(120);
  });

  it('devuelve las ocurrencias ordenadas por hora de inicio', () => {
    const ocurrencias = expandirFranjas(
      franjas,
      new Date('2026-08-10T00:00:00.000Z'),
      new Date('2026-08-24T00:00:00.000Z'),
      OFFSET,
    );
    const tiempos = ocurrencias.map(o => o.startAt.getTime());
    expect([...tiempos].sort((a, b) => a - b)).toEqual(tiempos);
  });

  it('incluye la clase que ya empezó pero todavía no termina', () => {
    // Rango que arranca a las 10:30 del campus, con la clase de 10:00 a 12:00.
    const desde = new Date('2026-08-10T15:30:00.000Z');
    const hasta = new Date('2026-08-10T16:00:00.000Z');
    const ocurrencias = expandirFranjas(franjas, desde, hasta, OFFSET);
    expect(ocurrencias).toHaveLength(1);
    expect(ocurrencias[0].franjaId).toBe('prog2');
  });

  it('ignora franjas con día u hora inválidos en vez de fallar', () => {
    const ocurrencias = expandirFranjas(
      [
        { id: 'malo', dayOfWeek: 9, startTime: '10:00' },
        { id: 'peor', dayOfWeek: 1, startTime: 'nunca' },
      ],
      new Date('2026-08-10T00:00:00.000Z'),
      new Date('2026-08-17T00:00:00.000Z'),
      OFFSET,
    );
    expect(ocurrencias).toEqual([]);
  });

  it('devuelve vacío si el rango está invertido', () => {
    expect(
      expandirFranjas(franjas, new Date('2026-08-17T00:00:00.000Z'), new Date('2026-08-10T00:00:00.000Z'), OFFSET),
    ).toEqual([]);
  });
});

describe('estado de una clase', () => {
  const clase = {
    startAt: new Date('2026-08-10T15:00:00.000Z'),
    endAt: new Date('2026-08-10T17:00:00.000Z'),
  };

  it('distingue las tres situaciones', () => {
    expect(estadoDeClase(clase, new Date('2026-08-10T14:59:00.000Z'))).toBe('PROXIMA');
    expect(estadoDeClase(clase, new Date('2026-08-10T15:00:00.000Z'))).toBe('EN_CURSO');
    expect(estadoDeClase(clase, new Date('2026-08-10T16:59:00.000Z'))).toBe('EN_CURSO');
    expect(estadoDeClase(clase, new Date('2026-08-10T17:00:00.000Z'))).toBe('TERMINADA');
  });
});

describe('clase actual y próxima', () => {
  const clases = [
    { startAt: new Date('2026-08-10T13:00:00.000Z'), endAt: new Date('2026-08-10T14:00:00.000Z') },
    { startAt: new Date('2026-08-10T15:00:00.000Z'), endAt: new Date('2026-08-10T17:00:00.000Z') },
    { startAt: new Date('2026-08-10T18:00:00.000Z'), endAt: new Date('2026-08-10T19:00:00.000Z') },
  ];

  it('encuentra la que está ocurriendo', () => {
    const actual = claseEnCurso(clases, new Date('2026-08-10T16:00:00.000Z'));
    expect(actual?.startAt.toISOString()).toBe('2026-08-10T15:00:00.000Z');
  });

  it('devuelve null cuando no hay ninguna en curso', () => {
    expect(claseEnCurso(clases, new Date('2026-08-10T17:30:00.000Z'))).toBeNull();
  });

  it('la próxima nunca es una que ya empezó', () => {
    const siguiente = proximaClase(clases, new Date('2026-08-10T16:00:00.000Z'));
    expect(siguiente?.startAt.toISOString()).toBe('2026-08-10T18:00:00.000Z');
  });

  it('con dos solapadas gana la que empezó más tarde', () => {
    const solapadas = [
      { startAt: new Date('2026-08-10T15:00:00.000Z'), endAt: new Date('2026-08-10T18:00:00.000Z') },
      { startAt: new Date('2026-08-10T16:00:00.000Z'), endAt: new Date('2026-08-10T17:00:00.000Z') },
    ];
    expect(claseEnCurso(solapadas, new Date('2026-08-10T16:30:00.000Z'))?.startAt.toISOString()).toBe(
      '2026-08-10T16:00:00.000Z',
    );
  });
});

describe('minutos que faltan', () => {
  it('redondea hacia arriba para no decir "0 minutos" antes de tiempo', () => {
    const inicio = new Date('2026-08-10T15:00:00.000Z');
    expect(minutosHasta(inicio, new Date('2026-08-10T14:59:01.000Z'))).toBe(1);
    expect(minutosHasta(inicio, new Date('2026-08-10T15:00:00.000Z'))).toBe(0);
    expect(minutosHasta(inicio, new Date('2026-08-10T14:28:00.000Z'))).toBe(32);
  });
});

describe('ventana del recordatorio', () => {
  const inicio = new Date('2026-08-10T15:00:00.000Z');

  it('dispara una sola vez con una ventana de un minuto', () => {
    const disparos = [];
    for (let minuto = 0; minuto < 60; minuto += 1) {
      const ahora = new Date(inicio.getTime() - 30 * 60_000 + minuto * 60_000);
      if (avisoEnVentana(inicio, 15, ahora, 1)) disparos.push(minuto);
    }
    expect(disparos).toHaveLength(1);
  });

  it('no dispara antes de tiempo', () => {
    expect(avisoEnVentana(inicio, 15, new Date('2026-08-10T14:40:00.000Z'), 1)).toBe(false);
  });

  it('dispara aunque el temporizador llegue tarde, dentro de la ventana', () => {
    // El tick de las 14:45 llegó a las 14:45:40.
    expect(avisoEnVentana(inicio, 15, new Date('2026-08-10T14:45:40.000Z'), 1)).toBe(true);
  });

  it('con antelación 0 avisa justo al empezar', () => {
    expect(avisoEnVentana(inicio, 0, new Date('2026-08-10T15:00:10.000Z'), 1)).toBe(true);
    expect(avisoEnVentana(inicio, 0, new Date('2026-08-10T15:01:10.000Z'), 1)).toBe(false);
  });
});

describe('antelaciones', () => {
  it('ordena de mayor a menor y quita repetidos', () => {
    expect(normalizarAntelaciones([15, 5, 15, 60])).toEqual([60, 15, 5]);
  });

  it('descarta valores imposibles sin romper el resto', () => {
    expect(normalizarAntelaciones([-5, 10, 99999, Number.NaN])).toEqual([10]);
  });

  it('la lista que ofrece la interfaz es válida', () => {
    expect(normalizarAntelaciones([...ANTELACIONES_VALIDAS])).toEqual([1440, 120, 60, 30, 15, 10, 5, 0]);
  });
});

describe('franja horaria (horas de silencio)', () => {
  it('resuelve la franja que cruza la medianoche', () => {
    expect(dentroDeFranja('21:00', '06:00', 22 * 60)).toBe(true);
    expect(dentroDeFranja('21:00', '06:00', 3 * 60)).toBe(true);
    expect(dentroDeFranja('21:00', '06:00', 12 * 60)).toBe(false);
  });

  it('resuelve la franja normal', () => {
    expect(dentroDeFranja('08:00', '12:00', 10 * 60)).toBe(true);
    expect(dentroDeFranja('08:00', '12:00', 13 * 60)).toBe(false);
  });

  it('una franja vacía o inválida no silencia nada', () => {
    expect(dentroDeFranja('08:00', '08:00', 8 * 60)).toBe(false);
    expect(dentroDeFranja('ayer', '06:00', 60)).toBe(false);
  });

  it('el minuto del día se calcula en hora del campus', () => {
    // 02:00 UTC son las 21:00 del campus.
    expect(minutoDelDiaLocal(new Date('2026-08-11T02:00:00.000Z'), OFFSET)).toBe(21 * 60);
  });
});

describe('preguntas de agenda', () => {
  // Lunes 10 de agosto de 2026, 09:00 del campus.
  const ahora = new Date('2026-08-10T14:00:00.000Z');

  it('reconoce lo que es una pregunta de agenda', () => {
    expect(pareceDeAgenda('¿Qué clases tengo hoy?')).toBe(true);
    expect(pareceDeAgenda('¿Qué tengo mañana?')).toBe(true);
    expect(pareceDeAgenda('¿Cuál es el promedio de Carlos?')).toBe(false);
  });

  it('hoy abarca el día local completo', () => {
    const intencion = detectarIntencionAgenda('¿Qué clases tengo hoy?', ahora, OFFSET);
    expect(intencion).toMatchObject({ tipo: 'RANGO', etiqueta: 'hoy' });
    if (intencion?.tipo !== 'RANGO') throw new Error('rango esperado');
    expect(intencion.desde.toISOString()).toBe('2026-08-10T05:00:00.000Z');
    expect(intencion.hasta.toISOString()).toBe('2026-08-11T05:00:00.000Z');
  });

  it('mañana es el día siguiente, no las próximas 24 horas', () => {
    const intencion = detectarIntencionAgenda('¿Qué tengo mañana?', ahora, OFFSET);
    if (intencion?.tipo !== 'RANGO') throw new Error('rango esperado');
    expect(intencion.desde.toISOString()).toBe('2026-08-11T05:00:00.000Z');
    expect(intencion.hasta.toISOString()).toBe('2026-08-12T05:00:00.000Z');
  });

  it('"después del almuerzo" es la tarde del campus', () => {
    const intencion = detectarIntencionAgenda('¿Qué tengo después del almuerzo?', ahora, OFFSET);
    if (intencion?.tipo !== 'RANGO') throw new Error('rango esperado');
    // 13:00 del campus = 18:00 UTC.
    expect(intencion.desde.toISOString()).toBe('2026-08-10T18:00:00.000Z');
  });

  it('distingue próxima clase de clase en curso', () => {
    expect(detectarIntencionAgenda('¿Cuál es mi próxima clase?', ahora, OFFSET)).toEqual({ tipo: 'PROXIMA' });
    expect(detectarIntencionAgenda('¿Qué clase tengo ahora?', ahora, OFFSET)).toEqual({ tipo: 'EN_CURSO' });
  });

  it('extrae la materia de "¿a qué hora tengo …?"', () => {
    expect(detectarIntencionAgenda('¿A qué hora tengo Programación II?', ahora, OFFSET)).toEqual({
      tipo: 'MATERIA',
      termino: 'programacion ii',
    });
  });

  it('un día ya pasado de esta semana se entiende como el de la próxima', () => {
    // Preguntado el lunes, "el domingo" es el de dentro de seis días.
    const intencion = detectarIntencionAgenda('¿Qué clases tengo el domingo?', ahora, OFFSET);
    if (intencion?.tipo !== 'RANGO') throw new Error('rango esperado');
    expect(intencion.desde.toISOString()).toBe('2026-08-16T05:00:00.000Z');
  });

  it('no interpreta como agenda lo que no lo es', () => {
    expect(detectarIntencionAgenda('¿Cuántos estudiantes reprobaron?', ahora, OFFSET)).toBeNull();
  });

  it('la materia se compara sin tildes ni mayúsculas', () => {
    expect(coincideMateria('Programación II', 'programacion')).toBe(true);
    expect(coincideMateria('Cálculo I', 'calculo i')).toBe(true);
    expect(coincideMateria('Cálculo I', 'ca')).toBe(false);
  });
});

describe('presentación de horas', () => {
  it('usa el reloj de 12 horas del campus', () => {
    expect(horaCampus(new Date('2026-08-10T15:00:00.000Z'), OFFSET)).toBe('10:00 a. m.');
    expect(horaCampus(new Date('2026-08-10T17:00:00.000Z'), OFFSET)).toBe('12:00 p. m.');
    expect(horaCampus(new Date('2026-08-10T05:00:00.000Z'), OFFSET)).toBe('12:00 a. m.');
  });

  it('describe la espera en la unidad que corresponde', () => {
    expect(tiempoRestante(32)).toBe('32 minutos');
    expect(tiempoRestante(1)).toBe('1 minuto');
    expect(tiempoRestante(120)).toBe('2 horas');
    expect(tiempoRestante(150)).toBe('2 h 30 min');
    expect(tiempoRestante(2880)).toBe('2 días');
    expect(tiempoRestante(0)).toBe('ya comenzó');
  });
});
