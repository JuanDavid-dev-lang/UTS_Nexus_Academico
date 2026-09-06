import { describe, expect, it } from 'vitest';
import {
  esCodigoValido,
  esInstitucionValida,
  idDeEnlace,
  MAX_CODIGO,
  MAX_INSTITUCION,
  normalizarCodigo,
} from '../src/domains/uniplanner/link-id.js';
import {
  generarInstitutionId,
  LIMITES,
} from '../src/domains/institutions/institution-profile.js';
import {
  CARGA,
  avisoDeCargaAcademica,
  avisoDeEntrega,
  avisoDeInasistencia,
  avisoDeNota,
  cupoConsumido,
  esFechaReal,
  faltasPermitidas,
  nivelDeInasistencia,
} from '../src/domains/uniplanner/message.js';

/**
 * El puente con UniPlanner, por donde de verdad se rompe.
 *
 * El nombre del documento de enlace lo calculan **dos aplicaciones distintas**
 * a partir de los mismos dos datos. Si una normaliza y la otra no, el enlace
 * existe, es válido, y no se encuentra: no llega ni un aviso y no hay ningún
 * error por el que enterarse. Estos casos son los mismos que fija
 * `test/institucional/institutional_inbox_test.dart` en UniPlanner, y esa
 * duplicación es a propósito.
 */
describe('identidad del enlace', () => {
  it('normaliza el código a mayúsculas y sin puntuación', () => {
    expect(normalizarCodigo('1.098.765-432')).toBe('1098765432');
    expect(normalizarCodigo(' ab-12 ')).toBe('AB12');
  });

  it('el mismo código escrito de dos maneras da el mismo documento', () => {
    expect(idDeEnlace('uts', '1.098.765.432')).toBe(idDeEnlace('uts', '1098765432'));
  });

  it('el separador doble impide que dos matrículas colisionen', () => {
    // Con un guión bajo simple, `uts_bucaramanga` + `123456` y `uts` +
    // `bucaramanga_123456` darían el mismo documento.
    expect(idDeEnlace('uts_bucaramanga', '123456')).toBe('uts_bucaramanga__123456');
    expect(idDeEnlace('uts', 'bucaramanga_123456')).toBe('uts__BUCARAMANGA123456');
  });

  it('un código demasiado corto no sirve para enlazar', () => {
    expect(esCodigoValido('12')).toBe(false);
    expect(idDeEnlace('uts', '12')).toBeNull();
  });

  it('recorta el código al máximo en vez de dejarlo libre', () => {
    expect(normalizarCodigo('A'.repeat(100))).toHaveLength(MAX_CODIGO);
  });

  it('una institución con mayúsculas o puntos no es válida', () => {
    expect(esInstitucionValida('UTS')).toBe(false);
    expect(esInstitucionValida('uts.b')).toBe(false);
    expect(esInstitucionValida('uts_b')).toBe(true);
    expect(idDeEnlace('UTS', '1098765432')).toBeNull();
  });

  it('todo id que emite el panel es un id que UniPlanner acepta', () => {
    // El fallo que esta prueba existe para impedir: el generador produce
    // `unab-2` cuando dos universidades comparten sigla, y el patrón de allá
    // solo admitía `[a-z0-9_]`. Esa segunda universidad no podía enlazar una
    // sola cuenta, y no había ningún error por el que enterarse.
    const enUso = new Set<string>();
    for (const [sigla, nombre] of [
      ['UTS', 'Unidades Tecnológicas de Santander'],
      ['UNAB', 'Universidad Autónoma de Bucaramanga'],
      ['UNAB', 'Universidad Nacional Andina de Bogotá'],
      ['UDES', 'Universidad de Santander'],
      ['UPB', 'Universidad Pontificia Bolivariana'],
    ] as const) {
      const id = generarInstitutionId(sigla, nombre, enUso);
      enUso.add(id);
      expect(esInstitucionValida(id), `«${id}» no lo aceptaría UniPlanner`).toBe(true);
      expect(idDeEnlace(id, '1098765432')).toBe(`${id}__1098765432`);
    }
    // Y el segundo UNAB de verdad lleva guion: si el generador cambiara y esta
    // prueba dejara de cubrir ese caso, no se enteraría nadie.
    expect([...enUso].some((id) => id.includes('-'))).toBe(true);
  });

  it('el tope de la clave es el mismo que el del catálogo', () => {
    // Con un tope más corto, las claves más largas del panel no podrían
    // enlazarse y no habría forma de saberlo desde ninguno de los dos lados.
    expect(MAX_INSTITUCION).toBe(LIMITES.ID_MAX);
  });
});

describe('semáforo de inasistencias', () => {
  it('el cupo sale del porcentaje ponderado, no del número de clases', () => {
    // Umbral 70 %: el cupo es el 30 % restante, así que un 85 % de asistencia
    // ha gastado exactamente la mitad.
    expect(cupoConsumido(100)).toBe(0);
    expect(cupoConsumido(85)).toBe(0.5);
    expect(cupoConsumido(70)).toBe(1);
  });

  it('no recorta por encima del límite', () => {
    // La diferencia entre estar justo en el límite y estar al doble es
    // información, no un número que haya que aplanar.
    expect(cupoConsumido(40)).toBeGreaterThan(1);
  });

  it('cada color empieza donde dice su umbral', () => {
    expect(nivelDeInasistencia(100)).toBe('VERDE');
    expect(nivelDeInasistencia(90)).toBe('VERDE');
    expect(nivelDeInasistencia(85)).toBe('AMARILLO');
    expect(nivelDeInasistencia(76)).toBe('ROJO');
    expect(nivelDeInasistencia(50)).toBe('ROJO');
  });

  it('las faltas permitidas se redondean hacia abajo', () => {
    // Con 30 clases y un 30 % de tolerancia, nueve faltas son el tope y la
    // décima es la que cuesta la materia.
    expect(faltasPermitidas(30)).toBe(9);
    expect(faltasPermitidas(10)).toBe(3);
    expect(faltasPermitidas(0)).toBe(0);
    expect(faltasPermitidas(-5)).toBe(0);
  });
});

describe('avisos que se escriben en el buzón', () => {
  const ahora = new Date('2026-09-06T12:00:00Z');

  it('el aviso de faltas lleva el cupo, no solo las faltas', () => {
    const aviso = avisoDeInasistencia({
      materiaCodigo: 'DCB007',
      materiaNombre: 'Cálculo Multivariable',
      docente: 'Carlos Mendoza',
      corte: 'Corte 2',
      clasesAusente: 4,
      totalClases: 16,
      porcentajeAsistencia: 75,
      ahora,
    });

    expect(aviso.type).toBe('attendance_alert');
    expect(aviso.payload).toEqual({ absences: 4, maxAllowed: 4 });
    // Sin cupo, la app no puede pintar cuánto queda: enseñaría "4 faltas" sin
    // decir si eso es mucho o poco.
    expect(aviso.expiresAt!.getTime()).toBeGreaterThan(ahora.getTime());
  });

  it('el texto compuesto ofrece una salida en vez de solo reprender', () => {
    const aviso = avisoDeInasistencia({
      materiaNombre: 'Física',
      clasesAusente: 3,
      totalClases: 10,
      porcentajeAsistencia: 70,
      ahora,
    });
    expect(aviso.message).toContain('justificantes');
  });

  it('el texto del docente manda sobre el compuesto', () => {
    const aviso = avisoDeInasistencia({
      materiaNombre: 'Física',
      clasesAusente: 3,
      totalClases: 10,
      porcentajeAsistencia: 70,
      mensaje: '  Pasa por mi oficina.  ',
      ahora,
    });
    expect(aviso.message).toBe('Pasa por mi oficina.');
  });

  it('la nota viaja siempre con su escala', () => {
    // Sin `scaleMax`, un 4.3 se guardaría tal cual sobre una escala de 100.
    const aviso = avisoDeNota({
      materiaNombre: 'Cálculo',
      corte: 1,
      nota: 4.3,
      escala: 5,
      ahora,
    });
    expect(aviso.payload).toMatchObject({ value: 4.3, scaleMax: 5, period: 1 });
    expect(aviso.term).toBe('Corte 1');
  });

  it('la carga académica se corta en el tope que acepta el receptor', () => {
    const aviso = avisoDeCargaAcademica({
      materias: Array.from({ length: CARGA.MAX_MATERIAS + 5 }, (_, i) => ({
        nombre: `Materia ${i}`,
        franjas: [{ dia: 1, inicio: '08:00', fin: '10:00' }],
      })),
      periodo: '2026-2',
      ahora,
    });
    const payload = aviso.payload as { courses: unknown[] };
    // Cortar aquí y no allí es lo que permite contarlo: el receptor también
    // corta, pero en silencio.
    expect(payload.courses).toHaveLength(CARGA.MAX_MATERIAS);
  });

  it('una materia sin aula no inventa el campo', () => {
    const aviso = avisoDeCargaAcademica({
      materias: [{ nombre: 'Seminario', franjas: [{ dia: 2, inicio: '14:00', fin: '16:00' }] }],
      ahora,
    });
    const payload = aviso.payload as { courses: { slots: Record<string, unknown>[] }[] };
    expect(payload.courses[0].slots[0]).not.toHaveProperty('room');
  });

  it('la entrega caduca poco después de su fecha, no dentro de cuatro meses', () => {
    const aviso = avisoDeEntrega({
      materiaNombre: 'Cálculo',
      titulo: 'Taller 3',
      fecha: '2026-10-01',
      ahora,
    });
    expect(aviso.payload).toMatchObject({ title: 'Taller 3', dueDate: '2026-10-01' });
    const vence = aviso.expiresAt!.getTime();
    expect(vence).toBeGreaterThan(new Date('2026-10-01').getTime());
    expect(vence).toBeLessThan(new Date('2026-11-15').getTime());
  });

  it('todos los tipos que se emiten son de los que el receptor conoce', () => {
    // Un tipo inventado cae allí en "aviso de texto" y pierde su acción, sin
    // fallar por ningún lado.
    const conocidos = ['attendance_alert', 'grade_published', 'course_load', 'assignment', 'notice'];
    const emitidos = [
      avisoDeInasistencia({ materiaNombre: 'x', clasesAusente: 1, totalClases: 4, porcentajeAsistencia: 80, ahora }),
      avisoDeNota({ materiaNombre: 'x', corte: 1, nota: 4, escala: 5, ahora }),
      avisoDeCargaAcademica({ materias: [{ nombre: 'x', franjas: [] }], ahora }),
      avisoDeEntrega({ materiaNombre: 'x', titulo: 'y', ahora }),
    ];
    for (const aviso of emitidos) expect(conocidos).toContain(aviso.type);
  });
});

describe('fechas de entrega imposibles', () => {
  /**
   * El caso que la especificación de la colaboración describe palabra por
   * palabra, y que el patrón `yyyy-MM-dd` no atrapa: `2026-02-31` lo cumple y
   * `new Date` **no falla** — desborda al 3 de marzo. Un recordatorio creado
   * así vencería tres días tarde en la app del estudiante sin que nada fallara
   * en ninguno de los dos lados.
   */
  it('un día que no existe no pasa por real', () => {
    expect(esFechaReal('2026-02-31')).toBe(false);
    expect(esFechaReal('2026-04-31')).toBe(false);
    expect(esFechaReal('2026-13-01')).toBe(false);
    expect(esFechaReal('2026-00-10')).toBe(false);
  });

  it('los días que sí existen pasan, incluido el 29 de febrero bisiesto', () => {
    expect(esFechaReal('2026-02-28')).toBe(true);
    expect(esFechaReal('2028-02-29')).toBe(true);
    expect(esFechaReal('2026-12-31')).toBe(true);
  });

  it('el 29 de febrero de un año no bisiesto no cuela', () => {
    expect(esFechaReal('2026-02-29')).toBe(false);
  });

  it('lo que no tiene la forma tampoco', () => {
    expect(esFechaReal('2026-2-3')).toBe(false);
    expect(esFechaReal('')).toBe(false);
    expect(esFechaReal('mañana')).toBe(false);
  });

  /**
   * El dominio no puede confiar en que la ruta lo haya filtrado: un plazo
   * imposible escrito en la app de otra persona ya no tiene a quién
   * preguntarle.
   */
  it('el aviso no publica una fecha imposible', () => {
    const aviso = avisoDeEntrega({
      materiaNombre: 'Cálculo',
      titulo: 'Taller 3',
      fecha: '2026-02-31',
      ahora: new Date('2026-01-10T00:00:00Z'),
    });
    expect(aviso.payload?.dueDate).toBeUndefined();
    expect(aviso.message).not.toContain('2026-02-31');
  });

  it('una fecha real sí viaja tal cual', () => {
    const aviso = avisoDeEntrega({
      materiaNombre: 'Cálculo',
      titulo: 'Taller 3',
      fecha: '2026-03-01',
      ahora: new Date('2026-01-10T00:00:00Z'),
    });
    expect(aviso.payload?.dueDate).toBe('2026-03-01');
  });
});
