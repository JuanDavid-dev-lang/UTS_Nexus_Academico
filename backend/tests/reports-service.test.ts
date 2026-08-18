/**
 * Filtros de los reportes.
 *
 * Un reporte es un PDF con membrete institucional que sale del edificio: si el
 * filtro deja pasar filas de más, no hay ninguna pantalla donde se note. Aquí
 * se fija a quién puede acotar cada rol y qué campos llegan a la consulta.
 */
import { describe, expect, it } from 'vitest';
import {
  filtroAcademico,
  filtroDeAsistencia,
  filtroDeNotas,
  filtrosDeConsulta,
} from '../src/modules/reports/reports.service.js';

const docente = { id: 'p1', role: 'PROFESSOR' };
const admin = { id: 'a1', role: 'ADMIN' };

describe('filtrosDeConsulta', () => {
  it('a un docente le fuerza SIEMPRE su propio id', () => {
    expect(filtrosDeConsulta({}, docente).teacherId).toBe('p1');
  });

  it('un docente NO puede pedir el reporte de otro por la URL', () => {
    // Regresión de un fallo real: el filtro solo forzaba el id del docente
    // cuando la consulta no traía uno, así que `?teacherId=otro` lo dejaba
    // puesto y el PDF salía con las notas y la asistencia del otro docente.
    // No daba error ni pantalla rara: daba un acta correcta de quien no era.
    expect(filtrosDeConsulta({ teacherId: 'p2' }, docente).teacherId).toBe('p1');
  });

  it('un ADMIN sí puede acotar por docente', () => {
    expect(filtrosDeConsulta({ teacherId: 'p2' }, admin).teacherId).toBe('p2');
  });

  it('sin sesión no se inventa un docente', () => {
    expect(filtrosDeConsulta({}, undefined).teacherId).toBeUndefined();
  });

  it('convierte las fechas del rango', () => {
    const filtros = filtrosDeConsulta({ dateFrom: '2026-03-01', dateTo: '2026-03-31' }, admin);
    expect(filtros.dateFrom).toBeInstanceOf(Date);
    expect(filtros.dateTo?.toISOString().slice(0, 10)).toBe('2026-03-31');
  });

  it('arrastra el resto de criterios tal cual', () => {
    const filtros = filtrosDeConsulta(
      { period: '2026-1', subjectId: 'm1', groupId: 'g1', studentId: 'e1' },
      admin,
    );
    expect(filtros).toMatchObject({
      period: '2026-1',
      subjectId: 'm1',
      groupId: 'g1',
      studentId: 'e1',
    });
  });
});

describe('filtroAcademico', () => {
  it('un docente queda acotado a lo suyo aunque pida otro', () => {
    expect(filtroAcademico({ teacherId: 'p2' }, docente).teacherId).toBe('p1');
  });

  it('un ADMIN puede acotar por docente', () => {
    expect(filtroAcademico({ teacherId: 'p2' }, admin).teacherId).toBe('p2');
  });
});

describe('filtroDeNotas', () => {
  it('nunca devuelve registros borrados', () => {
    expect(filtroDeNotas({}).deletedAt).toBeNull();
  });

  it('solo añade lo que se pidió: un filtro vacío no acota de más', () => {
    expect(filtroDeNotas({})).toEqual({ deletedAt: null });
  });

  it('acumula todos los criterios', () => {
    expect(filtroDeNotas({ period: '2026-1', subjectId: 'm1', teacherId: 'p1' })).toEqual({
      deletedAt: null,
      period: '2026-1',
      subjectId: 'm1',
      teacherId: 'p1',
    });
  });
});

describe('filtroDeAsistencia', () => {
  it('sin rango de fechas no añade condición sobre `date`', () => {
    expect(filtroDeAsistencia({ period: '2026-1' })).not.toHaveProperty('date');
  });

  it('un solo extremo del rango también vale', () => {
    const desde = new Date('2026-03-01');
    expect(filtroDeAsistencia({ dateFrom: desde }).date).toEqual({ $gte: desde });
  });

  it('con los dos extremos acota por ambos lados', () => {
    const desde = new Date('2026-03-01');
    const hasta = new Date('2026-03-31');
    expect(filtroDeAsistencia({ dateFrom: desde, dateTo: hasta }).date).toEqual({
      $gte: desde,
      $lte: hasta,
    });
  });

  it('hereda el acotado por docente de las notas', () => {
    expect(filtroDeAsistencia({ teacherId: 'p1' }).teacherId).toBe('p1');
  });
});
